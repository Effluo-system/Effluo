import { app } from '../config/appConfig.ts';
import { analyzePullRequest } from '../functions/semantic-conflict-detection/semanticConflictDetection.ts';
import { calculateReviewDifficultyOfPR } from '../functions/workload-calculation/workloadCalculation.ts';
import { PullRequestService } from '../services/pullRequest.service.ts';
import type { CustomError } from '../types/common.d.ts';
import { checkForMergeConflicts } from '../utils/checkForMergeConflicts.ts';
import { logger } from '../utils/logger.ts';

// Notify on merge conflicts
app.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
  logger.info(
    `Received a synchronize event for #${payload.pull_request.number}`
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

      await octokit.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.pull_request.number,
        body: 'This PR has a merge conflict. Please resolve the conflict and push the changes.❌',
      });
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

      await octokit.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.pull_request.number,
        body: 'The merge conflict has been resolved. This PR is now ready to be merged.✔️',
      });
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
});
