import { app } from '../config/appConfig.ts';
import { analyzePullRequest } from '../functions/semantic-conflict-detection/semanticConflictDetection.ts';
import {
  createResolutionComment,
  getResolution,
} from '../functions/textual-merge-conflict-resolution/textualMergeConflictResolution.ts';
import { calculateReviewDifficultyOfPR } from '../functions/workload-calculation/workloadCalculation.ts';
import { PRReviewRequestService } from '../services/prReviewRequest.service.ts';
import { PullRequestService } from '../services/pullRequest.service.ts';
import type { CustomError } from '../types/common.d.ts';
import { checkForMergeConflicts } from '../utils/checkForMergeConflicts.ts';
import { logger } from '../utils/logger.ts';

// Notify on merge conflicts
app.webhooks.on(
  ['pull_request.opened', 'pull_request.synchronize', 'pull_request.reopened'],
  async ({ octokit, payload }) => {
    logger.info(
      `Starting merge conflict resolution flow for #${payload.pull_request.number}`
    );
    try {
      let pr = await PullRequestService.getPullRequestById(
        payload?.pull_request?.id.toString()
      );
      if (!pr) {
        logger.info(`Pull request not found. Creating new pull request ...`);
        const files = await analyzePullRequest(
          octokit,
          payload.repository.owner.login,
          payload.repository.name,
          payload.pull_request.number,
          payload.pull_request.base.ref,
          payload.pull_request.head.ref
        );

        const reviewDifficulty = await calculateReviewDifficultyOfPR(files);
        pr = await PullRequestService.initiatePullRequestCreationFlow(
          payload,
          reviewDifficulty
        );
      } else {
        const files = await analyzePullRequest(
          octokit,
          payload.repository.owner.login,
          payload.repository.name,
          payload.pull_request.number,
          payload.pull_request.base.ref,
          payload.pull_request.head.ref
        );

        const reviewDifficulty = await calculateReviewDifficultyOfPR(files);
        pr.reviewDifficulty = reviewDifficulty;
        await PullRequestService.updatePullRequest(pr);
      }

      // Check for merge conflicts
      const mergable = await checkForMergeConflicts(
        octokit,
        payload.repository.owner.login,
        payload.repository.name,
        payload.pull_request.number
      );

      if (mergable === false) {
        await octokit.rest.issues.addLabels({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.pull_request.number,
          labels: ['Merge Conflict'],
        });

        const resolution = await getResolution(
          octokit as any,
          payload.repository.owner.login,
          payload.repository.name,
          payload.pull_request.number
        );

        if (resolution === undefined) {
          logger.error('Failed to resolve the merge conflict');
          return;
        }

        for (const conflict of resolution) {
          await createResolutionComment(
            octokit as any,
            payload.repository.id.toString(),
            payload.repository.owner.login,
            payload.repository.name,
            payload.pull_request.number,
            conflict.filename,
            conflict.resolvedCode,
            conflict.baseContent,
            conflict.oursContent,
            conflict.theirsContent,
            conflict.fileData
          );
        }
      } else {
        if (
          payload.pull_request.labels.some(
            (label) => label.name === 'Merge Conflict'
          )
        ) {
          logger.info('Removing the merge conflict label');
          await octokit.rest.issues.removeLabel({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.pull_request.number,
            name: 'Merge Conflict',
          });
        }
      }
    } catch (error) {
      const customError = error as CustomError;
      if (customError.response) {
        logger.error(
          `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
        );
      } else {
        logger.error(error);
      }
    }
  }
);

// Add listener for push events to detect base branch updates
app.webhooks.on('push', async ({ octokit, payload }) => {
  // Extract the branch name from the ref (format: refs/heads/branch-name)
  const branchName = payload.ref.replace('refs/heads/', '');
  logger.info(`Push detected to branch: ${branchName}`);

  // Get all open PRs that use this branch as their base
  const prs = await octokit.rest.pulls.list({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    state: 'open',
    base: branchName,
  });

  logger.info(
    `Found ${prs.data.length} open PRs with base branch ${branchName}`
  );

  // For each PR, check for merge conflicts
  for (const pr of prs.data) {
    logger.info(`Checking PR #${pr.number} for merge conflicts`);
    try {
      const mergable = await checkForMergeConflicts(
        octokit,
        payload.repository.owner.login,
        payload.repository.name,
        pr.number
      );

      if (mergable === false) {
        // Only add label if it doesn't already exist

        await octokit.rest.issues.addLabels({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: pr.number,
          labels: ['Merge Conflict'],
        });

        const resolution = await getResolution(
          octokit as any,
          payload.repository.owner.login,
          payload.repository.name,
          pr.number
        );

        if (resolution === undefined) {
          logger.error(
            `Failed to resolve the merge conflict for PR #${pr.number}`
          );
          continue;
        }

        for (const conflict of resolution) {
          await createResolutionComment(
            octokit as any,
            payload.repository.id.toString(),
            payload.repository.owner.login,
            payload.repository.name,
            pr.number,
            conflict.filename,
            conflict.resolvedCode,
            conflict.baseContent,
            conflict.oursContent,
            conflict.theirsContent,
            conflict.fileData
          );
        }
      } else if (pr.labels.some((label) => label.name === 'Merge Conflict')) {
        // Remove the merge conflict label if it exists and the PR is now mergeable
        logger.info(`Removing the merge conflict label from PR #${pr.number}`);
        await octokit.rest.issues.removeLabel({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: pr.number,
          name: 'Merge Conflict',
        });
      }
    } catch (error) {
      const customError = error as CustomError;
      if (customError.response) {
        logger.error(
          `Error processing PR #${pr.number}! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
        );
      } else {
        logger.error(`Error processing PR #${pr.number}: ${error}`);
      }
    }
  }
});

app.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
  try {
    const files = await analyzePullRequest(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const reviewDifficulty = await calculateReviewDifficultyOfPR(files);

    const prPromise = PullRequestService.getPullRequestById(
      payload?.pull_request?.id?.toString()
    );
    const reviewRequestPromise = PRReviewRequestService.findByPRId(
      payload?.pull_request?.id?.toString()
    );
    const [pr, reviewRequest] = await Promise.all([
      prPromise,
      reviewRequestPromise,
    ]);

    if (pr) {
      pr.reviewDifficulty = reviewDifficulty;
      await PullRequestService.updatePullRequest(pr);
    }
    if (reviewRequest) {
      reviewRequest.weight = reviewDifficulty;
      await PRReviewRequestService.updatePRReviewRequest(reviewRequest);
    }
  } catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      logger.error(
        `Error updating the review difficulty` + customError.message
      );
    } else {
      logger.error(`Error updating the review difficulty` + error);
    }
  }
});
