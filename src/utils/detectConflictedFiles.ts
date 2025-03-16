import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import diff3 from 'diff3';
import * as fs from 'fs';
import { Base64 } from 'js-base64';
import * as path from 'path';
import { logger } from './logger.ts';

// Utility functions for Git operations
/**
 * Execute a Git command and return its output
 */
function executeGitCommand(command: string, cwd: string): string {
  try {
    return execSync(command, { cwd, encoding: 'utf8' }).toString();
  } catch (error) {
    logger.debug(`Git command failed: ${command}`, error);
    throw error;
  }
}

/**
 * Creates a temporary directory for Git operations
 */
function createTempDir(): string {
  const tempDir = path.join(process.cwd(), `temp-git-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Setup a local Git repository for conflict detection
 */
async function setupLocalRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseBranch: string,
  headBranch: string
): Promise<{ repoPath: string; success: boolean }> {
  const tempDir = createTempDir();

  try {
    // Get repository clone URL
    const { data: repository } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    const cloneUrl = repository.clone_url;

    // Initialize an empty git repo
    executeGitCommand('git init', tempDir);

    // Add the GitHub repo as a remote
    const gitHubToken = process.env.GITHUB_TOKEN;
    const authCloneUrl = cloneUrl.replace(
      'https://',
      `https://${gitHubToken}@`
    );

    executeGitCommand(`git remote add origin ${authCloneUrl}`, tempDir);

    // Fetch the specific branches we need
    executeGitCommand(`git fetch origin ${baseBranch} ${headBranch}`, tempDir);

    // Create local tracking branches
    executeGitCommand(`git checkout -b base origin/${baseBranch}`, tempDir);

    return { repoPath: tempDir, success: true };
  } catch (error) {
    logger.error('Failed to set up local repo for conflict detection:', error);

    // Clean up the temp directory if there was an error
    try {
      fs.rmdirSync(tempDir, { recursive: true });
    } catch (cleanupError) {
      logger.error('Failed to clean up temp directory:', cleanupError);
    }

    return { repoPath: '', success: false };
  }
}

/**
 * Get conflicted files using Git merge
 */
function getGitConflictedFiles(repoPath: string, headBranch: string): string[] {
  try {
    // Try to merge the head branch - this will identify conflicts
    try {
      executeGitCommand(`git merge origin/${headBranch}`, repoPath);
      // If we get here, there were no conflicts (unlikely since GitHub reported the PR as not mergeable)
      return [];
    } catch (mergeError) {
      // Expected error due to conflicts
      // Get the list of conflicted files
      const output = executeGitCommand(
        'git diff --name-only --diff-filter=U',
        repoPath
      );
      return output.trim().split('\n').filter(Boolean);
    } finally {
      // Clean up: abort the merge
      try {
        executeGitCommand('git merge --abort', repoPath);
      } catch (abortError) {
        // It's okay if this fails, maybe the merge didn't start
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

/**
 * Clean up the local repository
 */
function cleanupLocalRepo(repoPath: string): void {
  try {
    fs.rmdirSync(repoPath, { recursive: true });
  } catch (error) {
    logger.error('Failed to clean up local repository:', error);
  }
}

// Utility functions for file content and diff3-based conflict detection
/**
 * Get file content from GitHub
 */
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

/**
 * Check if a file is a binary file
 */
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

/**
 * Check if a file is a JSON file
 */
function isJsonFile(filename: string): boolean {
  return (
    filename.endsWith('.json') ||
    filename === '.eslintrc' ||
    filename === '.babelrc' ||
    filename === '.prettierrc'
  );
}

/**
 * Check for conflicts in JSON dependencies
 */
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

    // Find packages modified in both branches
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

/**
 * Check for conflicts in JSON files
 */
function checkJsonConflicts(
  baseContent: string,
  oursContent: string,
  theirsContent: string
): boolean {
  // Parse JSON content
  const baseJson = JSON.parse(baseContent);
  const ourJson = JSON.parse(oursContent);
  const theirJson = JSON.parse(theirsContent);

  // For package.json, specifically check dependencies and devDependencies
  if (
    'dependencies' in baseJson ||
    'devDependencies' in baseJson ||
    'peerDependencies' in baseJson
  ) {
    // Check for dependency conflicts
    return checkDependencyConflicts(baseJson, ourJson, theirJson);
  }

  // Run diff3 on the stringified JSON with consistent formatting
  const baseLines = JSON.stringify(baseJson, null, 2).split('\n');
  const ourLines = JSON.stringify(ourJson, null, 2).split('\n');
  const theirLines = JSON.stringify(theirJson, null, 2).split('\n');

  const mergeResult = diff3(ourLines, baseLines, theirLines);
  // Check if any chunk in the result has a conflict
  return mergeResult.some((chunk) => 'conflict' in chunk);
}

/**
 * Check for conflicts in a file using diff3
 */
function checkForConflicts(
  baseContent: string,
  oursContent: string,
  theirsContent: string,
  filename: string
): boolean {
  // Split content into lines
  const baseLines = baseContent.split('\n');
  const ourLines = oursContent.split('\n');
  const theirLines = theirsContent.split('\n');

  // Handle empty files correctly
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
      // For JSON files, also check if the structure changed significantly
      return checkJsonConflicts(baseContent, oursContent, theirsContent);
    } catch (error) {
      logger.warn(
        `Error analyzing JSON file ${filename}, falling back to diff3`
      );
      // Fall back to diff3 if JSON parsing fails
    }
  }

  // Run the diff3 merge algorithm
  const mergeResult = diff3(ourLines, baseLines, theirLines);

  // Check if diff3 reported a conflict
  return mergeResult.some((chunk) => 'conflict' in chunk);
}

/**
 * Fallback method to detect conflicts using diff3
 */
async function detectConflictsUsingDiff3(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  pr: any,
  modifiedFiles: any[]
): Promise<string[]> {
  try {
    // Find the merge base (common ancestor) of the two branches
    const { data: compareData } = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: pr.base.sha,
      head: pr.head.sha,
    });
    const mergeBase = compareData.merge_base_commit.sha;

    logger.info(`Found merge base commit: ${mergeBase}`);

    // Check each file for conflicts
    const conflictingFiles: string[] = [];

    for (const file of modifiedFiles) {
      try {
        // Skip binary files - diff3 only works on text
        if (isBinaryFile(file.filename)) {
          logger.info(`Skipping binary file: ${file.filename}`);
          continue;
        }

        // Get all three versions of the file
        const [baseContent, oursContent, theirsContent] = await Promise.all([
          getFileContent(octokit, owner, repo, file.filename, mergeBase),
          getFileContent(octokit, owner, repo, file.filename, pr.head.sha),
          getFileContent(octokit, owner, repo, file.filename, pr.base.sha),
        ]);

        // Check for conflicts using diff3
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
        // If we can't properly check the file, assume it might be conflicting
        logger.info(
          `Adding ${file.filename} to conflict list due to error checking`
        );
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
 * This is the main public function exported from this utility
 * @param octokit Authenticated Octokit instance
 * @param owner Repository owner (username or organization)
 * @param repo Repository name
 * @param pullNumber Pull request number
 * @returns Array of conflicted file paths
 */
export async function extractConflictedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string[]> {
  let localRepoPath = '';

  try {
    // Get full PR details with mergeable status
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    logger.info(`PR #${pullNumber} mergeable status: ${pr.mergeable}`);

    // If PR is already mergeable, no conflicts
    if (pr.mergeable === true) {
      logger.info(`PR #${pullNumber} is mergeable, no conflicts to resolve`);
      return [];
    }

    // Get list of files in PR
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Filter for modified files
    const modifiedFiles = files.filter((file) => file.status === 'modified');
    if (modifiedFiles.length === 0) {
      logger.info('No modified files found in PR');
      return [];
    }

    logger.info(
      `Checking ${modifiedFiles.length} modified files for conflicts`
    );

    // Get the base and head branch names
    const baseBranch = pr.base.ref;
    const headBranch = pr.head.ref;

    // Primary approach: Use Git for conflict detection
    const { repoPath, success } = await setupLocalRepo(
      octokit,
      owner,
      repo,
      baseBranch,
      headBranch
    );

    localRepoPath = repoPath;

    if (success) {
      // Use Git to detect conflicted files
      const allConflictedFiles = getGitConflictedFiles(repoPath, headBranch);

      logger.info(`Git detected ${allConflictedFiles.length} conflicted files`);

      // Filter to only include files that are in the modified files list
      const modifiedFilePaths = modifiedFiles.map((file) => file.filename);
      const conflictingFiles = allConflictedFiles.filter((file) =>
        modifiedFilePaths.includes(file)
      );

      logger.info(
        `Found ${conflictingFiles.length} modified files with conflicts using Git`
      );

      // Clean up the temporary repository
      cleanupLocalRepo(localRepoPath);
      localRepoPath = '';

      return conflictingFiles;
    }

    // Fallback approach: Use diff3 for conflict detection
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

    // If we already have modified files and PR data from a previous error point,
    // try to use the fallback approach
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
    // Clean up the temporary repository if it exists
    if (localRepoPath) {
      cleanupLocalRepo(localRepoPath);
    }
  }
}
