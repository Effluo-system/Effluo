import { app } from '../config/appConfig.ts';
import { PullRequestService } from '../services/pullRequest.service.ts';
import { CustomError } from '../types/common.d';
import fs from 'fs';
import { logger } from '../utils/logger.ts';
import { analyzeReviewers } from '../functions/analyse-reviewers/analyseReviewers.ts';
import { RepoService } from '../services/repo.service.ts';
import { OwnerService } from '../services/owner.service.ts';
import {
  analyzePullRequest,
  analyzeConflicts,
} from '../functions/semantic-conflict-detection/semanticConflictDetection.ts';
import { calculateReviewDifficultyOfPR } from '../functions/workload-calculation/workloadCalculation.ts';
import { PullRequest } from '../entities/pullRequest.entity.ts';
import { PRReviewRequestService } from '../services/prReviewRequest.service.ts';

const messageForNewPRs = fs.readFileSync('./src/messages/message.md', 'utf8');
const messageForNewLabel = fs.readFileSync(
  './src/messages/messageNewLabel.md',
  'utf8'
);
// Subscribe to the "pull_request.opened" webhook event
app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
  logger.info(
    `Received a pull request event for #${payload.pull_request.number}`
  );
  try {
    await octokit.rest.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body: messageForNewPRs,
    });

    // Semantic conflict detection, Start ---------------------------------------------------------------------------------
    const files = await analyzePullRequest(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const conflictAnalysis = await analyzeConflicts(files);
    const reviewDifficulty = await calculateReviewDifficultyOfPR(files);

    // Post conflict analysis as a comment
    await octokit.rest.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body: conflictAnalysis,
    });
    // Semantic conflict detection, End ---------------------------------------------------------------------------------

    await PullRequestService.initiatePullRequestCreationFlow(
      payload,
      reviewDifficulty
    );
  } catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      logger.error(
        `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
      );
    } else {
      logger.error(customError.message || 'An unknown error occurred');
    }
  }
});

app.webhooks.on('pull_request.reopened', async ({ octokit, payload }) => {
  logger.info(
    `Received a pull request event for #${payload.pull_request.number}`
  );
  try {
    let pr = await PullRequestService.getPullRequestById(
      payload?.pull_request?.id.toString()
    );

    // Semantic conflict detection, Start ---------------------------------------------------------------------------------
    const files = await analyzePullRequest(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const conflictAnalysis = await analyzeConflicts(files);
    const reviewDifficulty = await calculateReviewDifficultyOfPR(files);
    if (!pr) {
      await PullRequestService.initiatePullRequestCreationFlow(
        payload,
        reviewDifficulty
      );
    } else {
      pr.reviewDifficulty = reviewDifficulty;
      await PullRequestService.updatePullRequest(pr);
    }

    // Post conflict analysis as a comment
    await octokit.rest.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body: conflictAnalysis,
    });
    // Semantic conflict detection, End ---------------------------------------------------------------------------------
  } catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      logger.error(
        `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
      );
    } else {
      logger.error(customError.message || 'An unknown error occurred');
    }
  }
});

//Subscribe to "label.created" webhook events
app.webhooks.on(
  ['pull_request.labeled', `pull_request.unlabeled`],
  async ({ octokit, payload }) => {
    try {
      if (!payload.sender.login.includes('bot')) {
        logger.info(`Received a label event for #${payload?.label?.name}`);

        await octokit.rest.issues.createComment({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.pull_request.number,
          body: messageForNewLabel,
        });

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
        }
        pr.labels = payload?.pull_request?.labels?.map((labels) => labels.name);
        await PullRequestService.updatePullRequest(pr);
        logger.info(`Pull request updated successfully`);
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

app.webhooks.on('pull_request.closed', async ({ octokit, payload }) => {
  try {
    const requests = await PRReviewRequestService.findByPRId(
      payload?.pull_request?.id?.toString()
    );
    if (requests) {
      await PRReviewRequestService.deleteRequest(requests);
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

// Notify the reviewer when a review is requested
// app.webhooks.on(
//   'pull_request.review_requested',
//   async ({ octokit, payload }) => {
//     logger.info(
//       `Received a review requested event for #${payload.pull_request.number}`
//     );
//     try {
//       setTimeout(async () => {
//         await octokit.rest.issues.createComment({
//           owner: payload.repository.owner.login,
//           repo: payload.repository.name,
//           issue_number: payload.pull_request.number,
//           body: `@${payload.requested_reviewer.login} you have been requested to review this PR🚀. Please take a look.`,
//         });
//       }, 5000);
//     } catch (error) {
//       if (error.response) {
//         logger.error(
//           `Error! Status: ${error.response.status}. Message: ${error.response.data.message}`
//         );
//       } else {
//         logger.error(error);
//       }
//     }
//   }
// );
