import { Octokit } from '@octokit/rest';
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

// Helper function to detect if changes from two branches overlap (indicating a potential conflict)
function detectOverlappingChanges(
  baseContent: string,
  oursContent: string,
  theirsContent: string
): boolean {
  // Split content into lines for comparison
  const baseLines = baseContent.split('\n');
  const ourLines = oursContent.split('\n');
  const theirLines = theirsContent.split('\n');

  // Use a simple line-by-line comparison to detect potential conflicts
  let ourChangedLines = new Set<number>();
  let theirChangedLines = new Set<number>();

  // Identify lines that were changed in our branch
  for (let i = 0; i < Math.max(baseLines.length, ourLines.length); i++) {
    const baseLine = baseLines[i] || '';
    const ourLine = ourLines[i] || '';

    if (baseLine !== ourLine) {
      ourChangedLines.add(i);
    }
  }

  // Identify lines that were changed in their branch
  for (let i = 0; i < Math.max(baseLines.length, theirLines.length); i++) {
    const baseLine = baseLines[i] || '';
    const theirLine = theirLines[i] || '';

    if (baseLine !== theirLine) {
      theirChangedLines.add(i);
    }
  }

  // Check for overlapping changes (changes to the same lines)
  for (const lineNum of ourChangedLines) {
    if (theirChangedLines.has(lineNum)) {
      return true; // Conflict found
    }
  }

  // Also check if line count changed significantly in both branches
  // This could indicate section insertions/deletions that might conflict
  const ourLineDiff = Math.abs(ourLines.length - baseLines.length);
  const theirLineDiff = Math.abs(theirLines.length - baseLines.length);

  if (ourLineDiff > 0 && theirLineDiff > 0) {
    // Both branches changed the number of lines, check if changes are close to each other
    // This is a heuristic that might catch some additional conflicts
    for (const ourLine of ourChangedLines) {
      for (const theirLine of theirChangedLines) {
        if (Math.abs(ourLine - theirLine) < 5) {
          // Within 5 lines of each other
          return true;
        }
      }
    }
  }

  return false;
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
    // If PR is not mergeable (or null/undefined), we need to find the conflicting files
    logger.info(
      `PR #${pullNumber} may have conflicts, mergeable status: ${pr.mergeable}`
    );
    // Get list of files in PR
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
    });
    // Files that might have conflicts (we'll verify each one)
    const modifiedFiles = files.filter((file) => file.status === 'modified');
    if (modifiedFiles.length === 0) {
      logger.info('No modified files found in PR');
      return [];
    }
    logger.info(
      `Checking ${modifiedFiles.length} modified files for conflicts`
    );
    // Check each file for conflicts using the /merge reference
    const conflictingFiles: string[] = [];

    // If PR is not mergeable, check each modified file for conflicts
    if (pr.mergeable === false) {
      logger.info(
        `PR #${pullNumber} is not mergeable, identifying conflicting files`
      );

      for (const file of modifiedFiles) {
        try {
          // Find the merge base (common ancestor) of the two branches
          const { data: compareData } = await octokit.rest.repos.compareCommits(
            {
              owner,
              repo,
              base: pr.base.sha,
              head: pr.head.sha,
            }
          );
          const mergeBase = compareData.merge_base_commit.sha;

          // Get all three versions of the file
          const [baseContent, oursContent, theirsContent] = await Promise.all([
            getFileContent(octokit, owner, repo, file.filename, mergeBase),
            getFileContent(octokit, owner, repo, file.filename, pr.head.sha),
            getFileContent(octokit, owner, repo, file.filename, pr.base.sha),
          ]);

          // Check if the file has conflicts by looking for overlapping changes
          const hasConflict = detectOverlappingChanges(
            baseContent,
            oursContent,
            theirsContent
          );

          if (hasConflict) {
            logger.info(`Conflict detected in file: ${file.filename}`);
            conflictingFiles.push(file.filename);
          }
        } catch (error) {
          logger.error(
            `Error checking file ${file.filename} for conflicts:`,
            error
          );
          // If we can't properly check the file, assume it might be conflicting
          // This could happen if a file was deleted in one branch
          logger.info(
            `Adding ${file.filename} to conflict list due to error checking`
          );
          conflictingFiles.push(file.filename);
        }
      }
    } else if (pr.mergeable === null) {
      // GitHub is still calculating mergeable status, be conservative and check all files
      logger.info(
        `PR #${pullNumber} mergeable status is null, checking all modified files`
      );
      for (const file of modifiedFiles) {
        logger.info(`Potential conflict in file: ${file.filename}`);
        conflictingFiles.push(file.filename);
      }
    } else {
      logger.info(`PR #${pullNumber} is mergeable, no conflicts to resolve`);
    }

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
