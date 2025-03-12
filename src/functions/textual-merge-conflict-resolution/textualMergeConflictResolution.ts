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
  baseContent?: string;
  oursContent?: string;
  theirsContent?: string;
  fileData?: ConflictData; // Include the original conflict data to access branch names
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

  const mergeResult = diff3(ourLines, baseLines, theirLines);
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
  const mergeResult = diff3(ourLines, baseLines, theirLines);

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
            baseContent: fileData.base.content,
            oursContent: fileData.ours.content,
            theirsContent: fileData.theirs.content,
            fileData: fileData, // Include the original conflict data with branch names
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

// Resolution Comment Functions
function generateGitStyleConflictView(
  baseContent: string,
  oursContent: string,
  theirsContent: string,
  fileData?: ConflictData
): string {
  // Split content into lines
  const baseLines = baseContent.split('\n');
  const ourLines = oursContent.split('\n');
  const theirLines = theirsContent.split('\n');

  // Use diff3 to find conflicts
  const mergeResult = diff3(ourLines, baseLines, theirLines);

  let conflictView = '';
  let hasConflict = false;

  // Process each chunk of the merge result
  for (const chunk of mergeResult) {
    if ('conflict' in chunk) {
      // This is a conflict chunk
      hasConflict = true;

      // Show a standard three-way merge conflict format:
      // <<<<<<< branch-name (Your branch)
      // [your changes]
      // ||||||| BASE
      // [original code]
      // =======
      // [their changes]
      // >>>>>>> target-branch-name (Target branch)

      // Use the ref information from the FileVersion objects if available
      const oursRef = fileData?.ours?.ref || 'YOURS';
      const theirsRef = fileData?.theirs?.ref || 'THEIRS';

      conflictView += `<<<<<<< ${oursRef} (Your branch)\n`;
      if (
        chunk.conflict &&
        chunk.conflict.a &&
        Array.isArray(chunk.conflict.a)
      ) {
        chunk.conflict.a.forEach((line) => (conflictView += line + '\n'));
      }

      conflictView += '||||||| BASE\n';
      if (
        chunk.conflict &&
        chunk.conflict.o &&
        Array.isArray(chunk.conflict.o)
      ) {
        chunk.conflict.o.forEach((line) => (conflictView += line + '\n'));
      }

      conflictView += '=======\n';
      if (
        chunk.conflict &&
        chunk.conflict.b &&
        Array.isArray(chunk.conflict.b)
      ) {
        chunk.conflict.b.forEach((line) => (conflictView += line + '\n'));
      }

      conflictView += `>>>>>>> ${theirsRef} (Target branch)\n`;
    } else {
      // This is a non-conflict chunk (array of lines)
      if (Array.isArray(chunk)) {
        for (const line of chunk) {
          conflictView += line + '\n';
        }
      }
    }
  }

  // If no conflicts were found by diff3, create a custom conflict view
  if (!hasConflict) {
    conflictView = '';

    // Add some context at the beginning (up to 3 lines)
    const contextLineCount = Math.min(3, baseLines.length);
    for (let i = 0; i < contextLineCount; i++) {
      conflictView += baseLines[i] + '\n';
    }

    // Add a simple diff
    // Use the ref information from the FileVersion objects if available
    const oursRef = fileData?.ours?.ref || 'YOURS';
    const theirsRef = fileData?.theirs?.ref || 'THEIRS';

    conflictView += `<<<<<<< ${oursRef} (Your branch)\n`;
    conflictView += oursContent + '\n';
    conflictView += '||||||| BASE\n';
    conflictView += baseContent + '\n';
    conflictView += '=======\n';
    conflictView += theirsContent + '\n';
    conflictView += `>>>>>>> ${theirsRef} (Target branch)\n`;
  }

  return conflictView;
}

function generateResolutionDiff(
  originalContent: string,
  resolvedContent: string,
  branchName?: string
): string {
  const originalLines = originalContent.split('\n');
  const resolvedLines = resolvedContent.split('\n');

  // Use branch name in label if available
  const displayLabel = branchName
    ? `Resolution (from ${branchName})`
    : 'Resolution';
  let unifiedDiff = `--- Original\n+++ ${displayLabel}\n`;

  // Generate the diff
  let added = 0;
  let removed = 0;

  for (
    let i = 0;
    i < Math.max(originalLines.length, resolvedLines.length);
    i++
  ) {
    const originalLine = i < originalLines.length ? originalLines[i] : '';
    const resolvedLine = i < resolvedLines.length ? resolvedLines[i] : '';

    if (originalLine !== resolvedLine) {
      if (originalLine) {
        unifiedDiff += `-${originalLine}\n`;
        removed++;
      }
      if (resolvedLine) {
        unifiedDiff += `+${resolvedLine}\n`;
        added++;
      }
    } else {
      unifiedDiff += ` ${originalLine}\n`;
    }
  }

  return unifiedDiff;
}

export async function createResolutionComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  filename: string,
  resolvedCode: string,
  baseContent?: string,
  oursContent?: string,
  theirsContent?: string,
  fileData?: ConflictData
) {
  let commentBody = `
### Resolution Summary for \`${filename}\`
`;

  // Add content only if we have all three versions
  if (baseContent && oursContent && theirsContent) {
    // 1. First show the Git-style conflict view
    const conflictView = generateGitStyleConflictView(
      baseContent,
      oursContent,
      theirsContent,
      fileData
    );

    // Use branch names in unified diffs if available
    const oursBranchName = fileData?.ours?.ref;
    const theirsBranchName = fileData?.theirs?.ref;

    const oursDiff = generateResolutionDiff(
      oursContent,
      resolvedCode,
      oursBranchName
    );

    const theirsDiff = generateResolutionDiff(
      theirsContent,
      resolvedCode,
      theirsBranchName
    );

    commentBody += `
#### Git-style Conflict View
<details>
<summary>Click to see the original conflict</summary>

\`\`\`diff
${conflictView}
\`\`\`
</details>

#### AI Resolution
<details>
<summary>Click to see the resolved code</summary>

\`\`\`
${resolvedCode}
\`\`\`
</details>

#### Resolution Changes

<details open>
<summary>Changes from your branch (${
      oursBranchName || 'YOURS'
    }) to resolution</summary>

\`\`\`diff
${oursDiff}
\`\`\`
</details>

<details open>
<summary>Changes from target branch (${
      theirsBranchName || 'THEIRS'
    }) to resolution</summary>

\`\`\`diff
${theirsDiff}
\`\`\`
</details>
`;
  } else {
    // Fallback if we don't have all three versions
    commentBody += `
#### Resolved Code
\`\`\`
${resolvedCode}
\`\`\`
`;
  }

  commentBody += `
Note: This is an automated suggestion. Please review the changes carefully before merging.
`;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body: commentBody,
  });
}

/**
 * Gets the conflict data for files with merge conflicts,
 * including information about the branch names.
 * This function is extracted to avoid duplicate code.
 */
export async function getConflictingData(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<ConflictData[]> {
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
      return [];
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
            ref: pr.head.ref, // This includes the actual branch name
          },
          theirs: {
            content: theirsContent,
            sha: pr.base.sha,
            ref: pr.base.ref, // This includes the actual target branch name
          },
        });
      } catch (error) {
        logger.error(`Failed to process file ${filename}:`, error);
        continue; // Skip this file and continue with others
      }
    }

    return conflictData;
  } catch (error) {
    logger.error('Failed to process conflict files:', error);
    return [];
  }
}
