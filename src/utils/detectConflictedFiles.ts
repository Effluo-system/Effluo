import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import diff3 from 'diff3';
import * as fs from 'fs';
import { Base64 } from 'js-base64';
import * as path from 'path';
import { logger } from './logger.ts';

function executeGitCommand(command: string, cwd: string): string {
  try {
    return execSync(command, { cwd, encoding: 'utf8' }).toString();
  } catch (error) {
    logger.debug(`Git command failed: ${command}`, error);
    throw error;
  }
}

function createTempDir(): string {
  const tempDir = path.join(process.cwd(), `temp-git-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

async function setupLocalRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseBranch: string,
  headBranch: string
): Promise<{ repoPath: string; success: boolean }> {
  const tempDir = createTempDir();

  try {
    const { data: repository } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    const cloneUrl = repository.clone_url;
    executeGitCommand('git init', tempDir);

    const gitHubToken = process.env.GITHUB_TOKEN;
    const authCloneUrl = cloneUrl.replace(
      'https://',
      `https://${gitHubToken}@`
    );

    executeGitCommand(`git remote add origin ${authCloneUrl}`, tempDir);
    executeGitCommand(`git fetch origin ${baseBranch} ${headBranch}`, tempDir);
    executeGitCommand(`git checkout -b base origin/${baseBranch}`, tempDir);

    return { repoPath: tempDir, success: true };
  } catch (error) {
    logger.error('Failed to set up local repo for conflict detection:', error);

    try {
      fs.rmdirSync(tempDir, { recursive: true });
    } catch (cleanupError) {
      logger.error('Failed to clean up temp directory:', cleanupError);
    }

    return { repoPath: '', success: false };
  }
}

function getGitConflictedFiles(repoPath: string, headBranch: string): string[] {
  try {
    try {
      executeGitCommand(`git merge origin/${headBranch}`, repoPath);
      return [];
    } catch (mergeError) {
      // Expected error due to conflicts
      const output = executeGitCommand(
        'git diff --name-only --diff-filter=U',
        repoPath
      );
      return output.trim().split('\n').filter(Boolean);
    } finally {
      try {
        executeGitCommand('git merge --abort', repoPath);
      } catch (abortError) {
        // Merge may not have started
        logger.warn(
          'Failed to abort merge, this might be expected:',
          abortError
        );
      }
    }
  } catch (error) {
    logger.error('Error detecting conflicts with git:', error);
    return [];
  }
}

function cleanupLocalRepo(repoPath: string): void {
  try {
    fs.rmdirSync(repoPath, { recursive: true });
  } catch (error) {
    logger.error('Failed to clean up local repository:', error);
  }
}

async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    const content = (response.data as any).content;
    return Base64.decode(content);
  } catch (error) {
    logger.error(`Failed to get content for ${path} at ${ref}:`, error);
    throw error;
  }
}

function isBinaryFile(filename: string): boolean {
  const binaryExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.webp',
    '.pdf',
    '.zip',
    '.gz',
    '.tar',
    '.ttf',
    '.woff',
    '.woff2',
    '.eot',
    '.mp3',
    '.mp4',
    '.avi',
    '.mov',
    '.exe',
    '.dll',
    '.so',
    '.o',
  ];

  return binaryExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
}

function isJsonFile(filename: string): boolean {
  return (
    filename.endsWith('.json') ||
    filename === '.eslintrc' ||
    filename === '.babelrc' ||
    filename === '.prettierrc'
  );
}

function checkDependencyConflicts(
  baseJson: any,
  ourJson: any,
  theirJson: any
): boolean {
  const depTypes = ['dependencies', 'devDependencies', 'peerDependencies'];

  for (const depType of depTypes) {
    if (!baseJson[depType] && !ourJson[depType] && !theirJson[depType]) {
      continue;
    }

    const baseDeps = baseJson[depType] || {};
    const ourDeps = ourJson[depType] || {};
    const theirDeps = theirJson[depType] || {};

    for (const pkg in ourDeps) {
      if (
        pkg in theirDeps &&
        ourDeps[pkg] !== theirDeps[pkg] &&
        (!(pkg in baseDeps) || ourDeps[pkg] !== baseDeps[pkg]) &&
        (!(pkg in baseDeps) || theirDeps[pkg] !== baseDeps[pkg])
      ) {
        // Both branches changed the same package to different versions
        return true;
      }
    }
  }

  return false;
}

function checkJsonConflicts(
  baseContent: string,
  oursContent: string,
  theirsContent: string
): boolean {
  const baseJson = JSON.parse(baseContent);
  const ourJson = JSON.parse(oursContent);
  const theirJson = JSON.parse(theirsContent);

  if (
    'dependencies' in baseJson ||
    'devDependencies' in baseJson ||
    'peerDependencies' in baseJson
  ) {
    return checkDependencyConflicts(baseJson, ourJson, theirJson);
  }

  const baseLines = JSON.stringify(baseJson, null, 2).split('\n');
  const ourLines = JSON.stringify(ourJson, null, 2).split('\n');
  const theirLines = JSON.stringify(theirJson, null, 2).split('\n');

  const mergeResult = diff3(ourLines, baseLines, theirLines);
  return mergeResult.some((chunk) => 'conflict' in chunk);
}

function checkForConflicts(
  baseContent: string,
  oursContent: string,
  theirsContent: string,
  filename: string
): boolean {
  const baseLines = baseContent.split('\n');
  const ourLines = oursContent.split('\n');
  const theirLines = theirsContent.split('\n');

  // Handle empty files
  if (
    (baseLines.length === 0 && ourLines.length === 0) ||
    (baseLines.length === 0 && theirLines.length === 0) ||
    (ourLines.length === 0 && theirLines.length === 0)
  ) {
    return false;
  }

  // Special handling for JSON files
  if (isJsonFile(filename)) {
    try {
      return checkJsonConflicts(baseContent, oursContent, theirsContent);
    } catch (error) {
      logger.warn(
        `Error analyzing JSON file ${filename}, falling back to diff3`
      );
    }
  }

  const mergeResult = diff3(ourLines, baseLines, theirLines);
  return mergeResult.some((chunk) => 'conflict' in chunk);
}

async function detectConflictsUsingDiff3(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  pr: any,
  modifiedFiles: any[]
): Promise<string[]> {
  try {
    // Find the merge base (common ancestor)
    const { data: compareData } = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: pr.base.sha,
      head: pr.head.sha,
    });
    const mergeBase = compareData.merge_base_commit.sha;

    logger.info(`Found merge base commit: ${mergeBase}`);
    const conflictingFiles: string[] = [];

    for (const file of modifiedFiles) {
      try {
        if (isBinaryFile(file.filename)) {
          logger.info(`Skipping binary file: ${file.filename}`);
          continue;
        }

        const [baseContent, oursContent, theirsContent] = await Promise.all([
          getFileContent(octokit, owner, repo, file.filename, mergeBase),
          getFileContent(octokit, owner, repo, file.filename, pr.head.sha),
          getFileContent(octokit, owner, repo, file.filename, pr.base.sha),
        ]);

        const hasConflict = checkForConflicts(
          baseContent,
          oursContent,
          theirsContent,
          file.filename
        );

        if (hasConflict) {
          logger.info(`Conflict detected in file: ${file.filename}`);
          conflictingFiles.push(file.filename);
        } else {
          logger.info(`No conflicts in file: ${file.filename}`);
        }
      } catch (error) {
        logger.error(
          `Error checking file ${file.filename} for conflicts:`,
          error
        );
        // Assume it might be conflicting if we can't check properly
        conflictingFiles.push(file.filename);
      }
    }

    logger.info(
      `Found ${conflictingFiles.length} files with conflicts using diff3`
    );
    return conflictingFiles;
  } catch (error) {
    logger.error('Error in diff3 conflict detection:', error);
    return [];
  }
}

/**
 * Extract conflicted files from modified files in a PR
 */
export async function extractConflictedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string[]> {
  let localRepoPath = '';

  try {
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    logger.info(`PR #${pullNumber} mergeable status: ${pr.mergeable}`);

    if (pr.mergeable === true) {
      logger.info(`PR #${pullNumber} is mergeable, no conflicts to resolve`);
      return [];
    }

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const modifiedFiles = files.filter((file) => file.status === 'modified');
    if (modifiedFiles.length === 0) {
      logger.info('No modified files found in PR');
      return [];
    }

    logger.info(
      `Checking ${modifiedFiles.length} modified files for conflicts`
    );

    const baseBranch = pr.base.ref;
    const headBranch = pr.head.ref;

    // Primary approach: Use Git
    const { repoPath, success } = await setupLocalRepo(
      octokit,
      owner,
      repo,
      baseBranch,
      headBranch
    );

    localRepoPath = repoPath;

    if (success) {
      const allConflictedFiles = getGitConflictedFiles(repoPath, headBranch);
      logger.info(`Git detected ${allConflictedFiles.length} conflicted files`);

      const modifiedFilePaths = modifiedFiles.map((file) => file.filename);
      const conflictingFiles = allConflictedFiles.filter((file) =>
        modifiedFilePaths.includes(file)
      );

      logger.info(
        `Found ${conflictingFiles.length} modified files with conflicts using Git`
      );

      cleanupLocalRepo(localRepoPath);
      localRepoPath = '';

      return conflictingFiles;
    }

    // Fallback approach: Use diff3
    logger.info('Using fallback diff3-based conflict detection');
    return await detectConflictsUsingDiff3(
      octokit,
      owner,
      repo,
      pullNumber,
      pr,
      modifiedFiles
    );
  } catch (error) {
    logger.error('Error detecting conflicting files:', error);

    // Try fallback if we failed during Git detection
    try {
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      const { data: files } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
      });

      const modifiedFiles = files.filter((file) => file.status === 'modified');

      logger.info('Attempting fallback conflict detection after error');
      return await detectConflictsUsingDiff3(
        octokit,
        owner,
        repo,
        pullNumber,
        pr,
        modifiedFiles
      );
    } catch (fallbackError) {
      logger.error('Fallback detection also failed:', fallbackError);
      return [];
    }
  } finally {
    if (localRepoPath) {
      cleanupLocalRepo(localRepoPath);
    }
  }
}
