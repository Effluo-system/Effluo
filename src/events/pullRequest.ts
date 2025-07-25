import { app } from '../config/appConfig.ts';
import { prioritizePullRequest } from '../functions/pr-prioritization/pr-prioritization.ts';
import {
  analyzeConflicts,
  analyzePullRequest,
  analyzePullRequest2,
  handleConflictAnalysis,
} from '../functions/semantic-conflict-detection/semanticConflictDetection.ts';
import { calculateReviewDifficultyOfPR } from '../functions/workload-calculation/workloadCalculation.ts';
import { PrConflictAnalysisService } from '../services/prConflictAnalysis.service.ts';
import { PRReviewRequestService } from '../services/prReviewRequest.service.ts';
import { PullRequestService } from '../services/pullRequest.service.ts';
import { CustomError } from '../types/common.d';
import { logger } from '../utils/logger.ts';

app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
  logger.info(
    `Received a pull request event for #${payload.pull_request.number}`
  );
  try {
    const files1 = await analyzePullRequest(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const files2 = await analyzePullRequest2(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const conflictAnalysis = await analyzeConflicts(files2);
    const reviewDifficulty = await calculateReviewDifficultyOfPR(files1);

    await handleConflictAnalysis(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      conflictAnalysis
    );

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
    await PrConflictAnalysisService.resetValidationFormPosted(
      payload.pull_request.number,
      payload.repository.owner.login,
      payload.repository.name
    );

    const files1 = await analyzePullRequest(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const files2 = await analyzePullRequest2(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const conflictAnalysis = await analyzeConflicts(files2);
    const reviewDifficulty = await calculateReviewDifficultyOfPR(files1);

    let pr = await PullRequestService.getPullRequestById(
      payload.pull_request.id.toString()
    );
    if (!pr) {
      pr = await PullRequestService.initiatePullRequestCreationFlow(
        payload,
        reviewDifficulty
      );
    } else {
      pr.reviewDifficulty = reviewDifficulty;
      await PullRequestService.updatePullRequest(pr);
    }

    await handleConflictAnalysis(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      conflictAnalysis
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

app.webhooks.on(
  ['pull_request.labeled', `pull_request.unlabeled`],
  async ({ octokit, payload }) => {
    try {
      if (!payload.sender.login.includes('bot')) {
        logger.info(`Received a label event for #${payload?.label?.name}`);

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

app.webhooks.on('pull_request', async ({ octokit, payload }) => {
  logger.info(
    `Received a pull request event for #${payload.pull_request.number}`
  );
  try {
    await prioritizePullRequest(
      octokit as any,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number
    );
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
