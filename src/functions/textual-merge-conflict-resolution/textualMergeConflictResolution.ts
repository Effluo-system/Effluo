import { Octokit } from '@octokit/rest';
import diff3 from 'diff3';
import { Base64 } from 'js-base64';
import { MergeResolution } from '../../entities/mergeResolution.entity.ts';
import { MergeConflictService } from '../../services/mergeConflict.service.ts';
import { OwnerService } from '../../services/owner.service.ts';
import { RepoService } from '../../services/repo.service.ts';
import { ConflictData, ResolutionData } from '../../types/mergeConflicts';
import { extractConflictedFiles } from '../../utils/detectConflictedFiles.ts';
import { logger } from '../../utils/logger.ts';

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

export async function getResolution(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<ResolutionData[] | undefined> {
  try {
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const conflictingFilenames = await extractConflictedFiles(
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
            fileData: fileData,
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

function generateGitStyleConflictView(
  baseContent: string,
  oursContent: string,
  theirsContent: string,
  fileData?: ConflictData
): string {
  const baseLines = baseContent.split('\n');
  const ourLines = oursContent.split('\n');
  const theirLines = theirsContent.split('\n');

  const mergeResult = diff3(ourLines, baseLines, theirLines);

  let conflictView = '';
  let hasConflict = false;

  // Process each chunk of the merge result
  for (const chunk of mergeResult) {
    if ('conflict' in chunk) {
      // This is a conflict chunk
      hasConflict = true;

      // Format as standard three-way merge conflict:
      // <<<<<<< branch-name (Your branch)
      // [your changes]
      // ||||||| BASE
      // [original code]
      // =======
      // [their changes]
      // >>>>>>> target-branch-name (Target branch)
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
      // Non-conflict chunk (array of lines)
      if (Array.isArray(chunk)) {
        for (const line of chunk) {
          conflictView += line + '\n';
        }
      }
    }
  }

  // If no conflicts were found, create a custom conflict view
  if (!hasConflict) {
    conflictView = '';

    // Add some context (up to 3 lines)
    const contextLineCount = Math.min(3, baseLines.length);
    for (let i = 0; i < contextLineCount; i++) {
      conflictView += baseLines[i] + '\n';
    }

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
  resolvedContent: string
): string {
  const originalLines = originalContent.split('\n');
  const resolvedLines = resolvedContent.split('\n');

  const displayLabel = 'Resolution';
  let unifiedDiff = `--- Original\n+++ ${displayLabel}\n`;

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

async function storeResolution(
  owner: string,
  repoName: string,
  pullNumber: number,
  filename: string,
  resolvedCode: string,
  baseContent?: string,
  oursContent?: string,
  theirsContent?: string,
  fileData?: ConflictData
) {
  try {
    let repoEntity = await RepoService.getRepoByOwnerAndName(owner, repoName);

    if (!repoEntity) {
      let ownerEntity = await OwnerService.getOwnersById(owner);
      if (!ownerEntity) {
        ownerEntity = await OwnerService.createOwner({
          id: owner,
          login: owner,
          url: `https://github.com/${owner}`,
          repos: [],
        });
      }

      repoEntity = await RepoService.createRepo({
        id: `${owner}/${repoName}`,
        full_name: repoName,
        url: `https://github.com/${owner}/${repoName}`,
        owner: ownerEntity,
        user_review_summary: null,
        issues: null,
      });
    }

    resolvedCode = JSON.stringify(resolvedCode);
    baseContent = JSON.stringify(baseContent);
    oursContent = JSON.stringify(oursContent);
    theirsContent = JSON.stringify(theirsContent);

    // Check if resolution already exists for this file in this PR
    const existingResolution =
      await MergeConflictService.getResolutionByPRAndFilename(
        repoEntity.id,
        pullNumber,
        filename
      );

    const currentTimestamp = new Date().toISOString();

    if (existingResolution) {
      // Update the existing resolution
      existingResolution.resolvedCode = resolvedCode;
      existingResolution.baseContent = baseContent;
      existingResolution.oursContent = oursContent;
      existingResolution.theirsContent = theirsContent;
      existingResolution.confirmed = false;
      existingResolution.applied = false;
      existingResolution.lastProcessedTimestamp = currentTimestamp;

      if (fileData?.ours?.ref) {
        existingResolution.oursBranch = fileData.ours.ref;
      }

      if (fileData?.theirs?.ref) {
        existingResolution.theirsBranch = fileData.theirs.ref;
      }

      await MergeConflictService.saveMergeResolution(existingResolution);
      logger.info(`Updated resolution for ${filename} in PR #${pullNumber}`);
    } else {
      // Store as new resolution
      const newResolution = new MergeResolution();
      newResolution.repo = { id: repoEntity.id } as any;
      newResolution.pullRequestNumber = pullNumber;
      newResolution.filename = filename;
      newResolution.resolvedCode = resolvedCode;
      newResolution.baseContent = baseContent;
      newResolution.oursContent = oursContent;
      newResolution.theirsContent = theirsContent;
      newResolution.confirmed = false;
      newResolution.applied = false;
      newResolution.lastProcessedTimestamp = currentTimestamp;

      if (fileData?.ours?.ref) {
        newResolution.oursBranch = fileData.ours.ref;
      }

      if (fileData?.theirs?.ref) {
        newResolution.theirsBranch = fileData.theirs.ref;
      }

      await MergeConflictService.saveMergeResolution(newResolution);
      logger.info(`Stored new resolution for ${filename} in PR #${pullNumber}`);
    }
  } catch (error) {
    logger.error(`Failed to store resolution for ${filename}:`, error);
  }
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
    // Show the Git-style conflict view
    const conflictView = generateGitStyleConflictView(
      baseContent,
      oursContent,
      theirsContent,
      fileData
    );

    const oursBranchName = fileData?.ours?.ref;
    const theirsBranchName = fileData?.theirs?.ref;

    const oursDiff = generateResolutionDiff(oursContent, resolvedCode);
    const theirsDiff = generateResolutionDiff(theirsContent, resolvedCode);

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
<summary>Changes from resolution to your branch (${
      oursBranchName || 'YOURS'
    })</summary>

\`\`\`diff
${oursDiff}
\`\`\`
</details>

<details open>
<summary>Changes from resolution to the target branch (${
      theirsBranchName || 'THEIRS'
    })</summary>

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
Note: This is an automated suggestion. Please review the changes carefully before merging. If you are satisfied with the resolution, you can approve the changes by commenting 
\`\`\`
Apply all resolutions
\`\`\`

Please note there will be no further confirmation before applying all resolutions.
`;

  // Create the comment in GitHub
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body: commentBody,
  });

  await storeResolution(
    owner,
    repo,
    pullNumber,
    filename,
    resolvedCode,
    baseContent,
    oursContent,
    theirsContent,
    fileData
  );
}

export async function checkForCommitResolutionCommands(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<{
  applyAll: boolean;
  commentId?: number;
  user?: string;
  commandTimestamp?: string;
}> {
  try {
    logger.info(`Checking for commit resolution commands in PR #${pullNumber}`);

    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: pullNumber,
      sort: 'created',
      direction: 'desc', // Most recent first
      per_page: 100,
    });

    logger.info(`Found ${comments.length} comments in PR #${pullNumber}`);

    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    let applyAll = false;
    let applyAllCommentId: number | undefined;
    let applyAllUser: string | undefined;
    let commandTimestamp: string | undefined;

    const repoEntity = await RepoService.getRepoByOwnerAndName(owner, repo);
    if (!repoEntity) {
      logger.error(`Repository ${owner}/${repo} not found in database`);
      return { applyAll: false };
    }

    // Get the latest processed command timestamp
    const latestResolution =
      await MergeConflictService.getLatestProcessedResolution(
        repoEntity.id,
        pullNumber
      );

    const lastProcessedTimestamp = latestResolution?.lastProcessedTimestamp;
    logger.info(
      `Last processed command timestamp: ${lastProcessedTimestamp || 'none'}`
    );

    // Patterns for "apply all" commands
    const applyAllPatterns = [
      /apply resolution/i,
      /commit resolution/i,
      /accept resolution/i,
      /approve resolution/i,
      /apply all resolutions/i,
      /resolve all conflicts/i,
    ];

    // Check from most recent to oldest comment
    for (const comment of comments) {
      if (comment.user?.type === 'Bot') continue;

      // Skip already processed comments
      if (
        lastProcessedTimestamp &&
        new Date(comment.created_at) <= new Date(lastProcessedTimestamp)
      ) {
        logger.info(
          `Skipping previously processed comment from ${comment.user?.login} at ${comment.created_at}`
        );
        continue;
      }

      const canApprove = comment.user?.login === pr.user.login;

      if (!canApprove) {
        try {
          const { status } = await octokit.rest.repos.checkCollaborator({
            owner,
            repo,
            username: comment.user?.login || '',
          });
          if (status !== 204) continue;
        } catch (error) {
          continue;
        }
      }

      // Check if this comment contains a resolution command
      for (const pattern of applyAllPatterns) {
        if (comment.body?.match(pattern)) {
          const pendingResolutions =
            await MergeConflictService.getResolutionsByPullRequest(
              repoEntity.id,
              pullNumber
            );

          const unappliedResolutions = pendingResolutions.filter(
            (resolution) => !resolution.applied
          );

          if (unappliedResolutions.length > 0) {
            applyAll = true;
            applyAllCommentId = comment.id;
            applyAllUser = comment.user?.login || 'unknown';
            commandTimestamp = comment.created_at;

            // Mark all pending resolutions as confirmed
            for (const resolution of unappliedResolutions) {
              if (!resolution.confirmed) {
                resolution.confirmed = true;
                await MergeConflictService.saveMergeResolution(resolution);
              }
            }

            logger.info(
              `Found new command from ${comment.user?.login} at ${comment.created_at}, will apply ${unappliedResolutions.length} resolutions`
            );
            break;
          } else {
            logger.info(
              `No unapplied resolutions found for PR #${pullNumber}, nothing to do`
            );
          }
        }
      }

      if (applyAll) break;
    }

    return {
      applyAll,
      commentId: applyAllCommentId,
      user: applyAllUser,
      commandTimestamp,
    };
  } catch (error) {
    logger.error(`Error checking for commit commands: ${error}`);
    return { applyAll: false };
  }
}

export async function resolveAllConflicts(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<boolean> {
  let tempBranch: string | null = null;

  try {
    const repoEntity = await RepoService.getRepoByOwnerAndName(owner, repo);
    if (!repoEntity) {
      logger.error(`Repository ${owner}/${repo} not found in database`);
      return false;
    }

    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const resolutions = await MergeConflictService.getResolutionsByPullRequest(
      repoEntity.id,
      pullNumber
    );

    const pendingResolutions = resolutions.filter(
      (resolution) => resolution.confirmed && !resolution.applied
    );

    if (pendingResolutions.length === 0) {
      logger.info(`No pending resolutions found for PR #${pullNumber}`);
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: `ℹ️ No pending conflict resolutions to apply.`,
      });
      return false;
    }

    logger.info(
      `Applying ${pendingResolutions.length} resolutions for PR #${pullNumber}`
    );

    const baseBranch = pr.base.ref;
    const headBranch = pr.head.ref;
    tempBranch = `temp-merge-${pullNumber}-${Date.now()}`;

    const { data: baseRef } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });
    const baseSha = baseRef.object.sha;

    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${tempBranch}`,
      sha: baseSha,
    });

    logger.info(`Created temporary branch ${tempBranch} from ${baseBranch}`);

    const { data: prFiles } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const filesInPR = prFiles.map((file) => file.filename);
    logger.info(`Found ${filesInPR.length} files changed in PR #${pullNumber}`);

    let successCount = 0;
    const failedFiles: string[] = [];

    // Copy non-conflicting files from PR branch to temp branch
    const resolvedFilenames = pendingResolutions.map((r) => r.filename);
    const nonConflictingFiles = filesInPR.filter(
      (file) => !resolvedFilenames.includes(file)
    );

    for (const filename of nonConflictingFiles) {
      try {
        let fileContent, fileSha;
        try {
          const { data: fileData } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: filename,
            ref: headBranch,
          });

          if (Array.isArray(fileData)) {
            logger.warn(`Skipping directory: ${filename}`);
            continue;
          }

          if (fileData.type === 'file' && 'content' in fileData) {
            fileContent = fileData.content;
          } else {
            throw new Error(`Unexpected file type for ${filename}`);
          }

          try {
            const { data: tempFileData } = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: filename,
              ref: tempBranch,
            });

            if (!Array.isArray(tempFileData)) {
              fileSha = tempFileData.sha;
            }
          } catch (error) {
            // File doesn't exist in temp branch yet
          }

          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: filename,
            message: `Copy changes for ${filename} from PR #${pullNumber}`,
            content: fileContent,
            branch: tempBranch,
            sha: fileSha,
          });

          logger.info(`Copied non-conflicting file ${filename} to temp branch`);
        } catch (error) {
          logger.warn(
            `Error copying non-conflicting file ${filename}: ${error}`
          );
        }
      } catch (error) {
        logger.warn(
          `Error processing non-conflicting file ${filename}: ${error}`
        );
      }
    }

    // Apply conflict resolutions to the temp branch
    for (const resolution of pendingResolutions) {
      let applied = false;
      try {
        let resolvedContent;
        try {
          resolvedContent = JSON.parse(resolution.resolvedCode);
        } catch (error) {
          logger.error(
            `Failed to parse resolvedCode for ${resolution.filename}:`,
            error
          );
          resolvedContent = resolution.resolvedCode;
        }

        let fileSha;
        try {
          const { data: fileData } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: resolution.filename,
            ref: tempBranch,
          });

          if (!Array.isArray(fileData)) {
            fileSha = fileData.sha;
          }
        } catch (error) {
          // File doesn't exist in temp branch yet
        }

        logger.info(
          `Applying resolution for ${resolution.filename} to temp branch ${tempBranch}`
        );

        const { data: commitData } =
          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: resolution.filename,
            message: `Resolve merge conflict in ${resolution.filename}`,
            content: Buffer.from(resolvedContent).toString('base64'),
            branch: tempBranch,
            sha: fileSha,
          });

        successCount++;
        applied = true;
        logger.info(
          `Successfully applied resolution for ${resolution.filename}`
        );

        await MergeConflictService.markResolutionAsApplied(
          repoEntity.id,
          pullNumber,
          resolution.filename,
          commitData.commit.sha ?? ''
        );
      } catch (error) {
        logger.error(
          `Failed to apply resolution for ${resolution.filename}:`,
          error
        );
        failedFiles.push(resolution.filename);

        if (!applied) {
          try {
            const resolutionEntity =
              await MergeConflictService.getResolutionByPRAndFilename(
                repoEntity.id,
                pullNumber,
                resolution.filename
              );

            if (resolutionEntity) {
              await MergeConflictService.markAllResolutionsAsNotApplied(
                repoEntity.id,
                pullNumber
              );
            }
          } catch (dbError) {
            logger.error(
              `Failed to update database status for ${resolution.filename}: ${dbError}`
            );
          }
        }
      }
    }

    if (successCount === 0) {
      logger.error(`Failed to apply any resolutions`);

      if (tempBranch) {
        try {
          await octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `heads/${tempBranch}`,
          });
          logger.info(`Deleted temporary branch ${tempBranch}`);
          tempBranch = null;
        } catch (deleteError) {
          logger.error(`Error deleting temporary branch: ${deleteError}`);
        }
      }

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: `❌ Failed to apply any of the ${pendingResolutions.length} conflict resolutions.`,
      });

      return false;
    }

    try {
      // Force update the PR branch with our temp branch
      const { data: tempRef } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${tempBranch}`,
      });
      const tempSha = tempRef.object.sha;

      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${headBranch}`,
        sha: tempSha,
        force: true,
      });

      logger.info(
        `Force-updated PR branch ${headBranch} with resolved conflicts`
      );

      if (tempBranch) {
        await octokit.rest.git.deleteRef({
          owner,
          repo,
          ref: `heads/${tempBranch}`,
        });
        logger.info(`Deleted temporary branch ${tempBranch}`);
        tempBranch = null;
      }

      let commentBody = '';
      if (failedFiles.length > 0) {
        commentBody = `⚠️ Applied ${successCount} out of ${
          pendingResolutions.length
        } conflict resolutions.\n\nFailed to apply resolutions for:\n${failedFiles
          .map((file) => `- \`${file}\``)
          .join('\n')}`;
      } else {
        commentBody = `✅ Successfully applied all ${successCount} conflict resolutions!`;
      }

      const { data: updatedPR } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      if (updatedPR.mergeable === true) {
        commentBody += `\n\n🎉 This PR is now mergeable!`;
      } else if (updatedPR.mergeable === false) {
        commentBody += `\n\n⚠️ There are still merge conflicts in this PR that need to be resolved.`;
      } else {
        commentBody += `\n\nℹ️ GitHub is still calculating whether the PR is mergeable.`;
      }

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: commentBody,
      });

      return true;
    } catch (error) {
      logger.error(`Error updating PR branch: ${error}`);

      // Reset resolution status in the database
      await MergeConflictService.markAllResolutionsAsNotApplied(
        repoEntity.id,
        pullNumber
      );

      if (tempBranch) {
        try {
          await octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `heads/${tempBranch}`,
          });
          logger.info(`Deleted temporary branch ${tempBranch}`);
          tempBranch = null;
        } catch (deleteError) {
          logger.error(`Error deleting temporary branch: ${deleteError}`);
        }
      }

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: `❌ Error updating PR branch with resolved conflicts: ${error}`,
      });

      return false;
    }
  } catch (error) {
    logger.error(`Error in resolveAllConflicts: ${error}`);

    if (tempBranch) {
      try {
        await octokit.rest.git.deleteRef({
          owner,
          repo,
          ref: `heads/${tempBranch}`,
        });
        logger.info(`Deleted temporary branch ${tempBranch}`);
      } catch (deleteError) {
        logger.error(`Error deleting temporary branch: ${deleteError}`);
      }
    }

    try {
      const repoEntity = await RepoService.getRepoByOwnerAndName(owner, repo);
      if (repoEntity) {
        await MergeConflictService.markAllResolutionsAsNotApplied(
          repoEntity.id,
          pullNumber
        );
      }
    } catch (dbError) {
      logger.error(
        `Failed to update database statuses after global error: ${dbError}`
      );
    }

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: `❌ An error occurred while trying to apply conflict resolutions: ${error}`,
    });

    return false;
  }
}
