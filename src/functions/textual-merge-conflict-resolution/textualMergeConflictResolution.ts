import { Octokit } from '@octokit/rest';
import diff3 from 'diff3';
import { Base64 } from 'js-base64';
import { logger } from '../../utils/logger.ts';

interface FileVersion {
  content: string;
  sha: string;
  ref: string;
}

interface ConflictData {
  filename: string;
  base: FileVersion;
  ours: FileVersion; // current branch version
  theirs: FileVersion; // target branch version
}

interface ResolutionData {
  filename: string;
  resolvedCode: string;
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

  const mergeResult = diff3(baseLines, ourLines, theirLines);
  // Check if any chunk in the result has a conflict
  return mergeResult.some((chunk) => 'conflict' in chunk);
}

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
  const mergeResult = diff3(baseLines, ourLines, theirLines);

  // Check if diff3 reported a conflict
  return mergeResult.some((chunk) => 'conflict' in chunk);
}

async function getConflictingFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string[]> {
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

    // Files that might have conflicts (only check modified files)
    const modifiedFiles = files.filter((file) => file.status === 'modified');
    if (modifiedFiles.length === 0) {
      logger.info('No modified files found in PR');
      return [];
    }

    logger.info(
      `Checking ${modifiedFiles.length} modified files for conflicts`
    );

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

    logger.info(`Found ${conflictingFiles.length} files with conflicts`);
    return conflictingFiles;
  } catch (error) {
    logger.error('Error detecting conflicting files:', error);
    return [];
  }
}

export async function getResolution(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<ResolutionData[] | undefined> {
  try {
    // Get PR details
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const conflictingFilenames = await getConflictingFiles(
      octokit,
      owner,
      repo,
      pullNumber
    );

    if (conflictingFilenames.length === 0) {
      logger.info('No conflicting files found');
      return;
    }

    const conflictData: ConflictData[] = [];

    // Gather conflict data for all files
    for (const filename of conflictingFilenames) {
      try {
        // Get common ancestor commit (merge base)
        const { data: compareData } = await octokit.rest.repos.compareCommits({
          owner,
          repo,
          base: pr.base.sha,
          head: pr.head.sha,
        });

        const mergeBase = compareData.merge_base_commit.sha;

        // Get all three versions of the file
        const [baseContent, oursContent, theirsContent] = await Promise.all([
          getFileContent(octokit, owner, repo, filename, mergeBase),
          getFileContent(octokit, owner, repo, filename, pr.head.sha),
          getFileContent(octokit, owner, repo, filename, pr.base.sha),
        ]);

        conflictData.push({
          filename: filename,
          base: {
            content: baseContent,
            sha: mergeBase,
            ref: 'merge-base',
          },
          ours: {
            content: oursContent,
            sha: pr.head.sha,
            ref: pr.head.ref,
          },
          theirs: {
            content: theirsContent,
            sha: pr.base.sha,
            ref: pr.base.ref,
          },
        });
      } catch (error) {
        logger.error(`Failed to process file ${filename}:`, error);
        continue; // Skip this file and continue with others
      }
    }

    // Process all conflict data
    const resolutionData: ResolutionData[] = [];
    for (const fileData of conflictData) {
      try {
        const url = `${process.env.FLASK_URL}/mcr`;
        logger.info(`Attempting to send request to: ${url}`);
        logger.info('Request payload:', {
          name: fileData.filename,
          base_code: fileData.base.content.substring(0, 100) + '...', // Log partial content
          branch_a_code: fileData.ours.content.substring(0, 100) + '...',
          branch_b_code: fileData.theirs.content.substring(0, 100) + '...',
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: fileData.filename,
            base_code: fileData.base.content,
            branch_a_code: fileData.ours.content,
            branch_b_code: fileData.theirs.content,
            baseSha: fileData.base.sha,
            oursSha: fileData.ours.sha,
            theirsSha: fileData.theirs.sha,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'success') {
          resolutionData.push({
            filename: fileData.filename,
            resolvedCode: data.resolved_code,
          });
          logger.info(
            `Successfully resolved conflict for ${fileData.filename}`
          );
        } else {
          logger.error(
            `Failed to resolve conflict for ${fileData.filename}. Response:`,
            response.status
          );
        }
      } catch (error) {
        logger.error(
          `Failed to send ${fileData.filename} to Flask server:`,
          error
        );
      }
    }

    // Return all resolution data at once
    logger.info('Completed processing all conflict files', {
      totalResolved: resolutionData.length,
      totalConflicts: conflictData.length,
    });
    return resolutionData.length > 0 ? resolutionData : undefined;
  } catch (error) {
    logger.error('Failed to process conflict files:', error);
    throw error;
  }
}

export async function createResolutionComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  filename: string,
  resolvedCode: string
) {
  const commentBody = `
  ### Suggested Resolution for \`${filename}\`
  
  \`\`\`
  ${resolvedCode}
  \`\`\`
  
  This is an AI-suggested resolution for the merge conflict. Please review carefully before applying.
  You can copy this code and use it to resolve the conflict manually.
  
  Note: This is an automated suggestion. Please review the changes carefully before merging.
  `;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body: commentBody,
  });
}
