import { app } from '../config/appConfig.ts';
import { analyzeReviewers } from '../functions/analyse-reviewers/analyseReviewers.ts';
import { PullRequestService } from '../services/pullRequest.service.ts';
import { ReviewService } from '../services/review.service.ts';
import type { CustomError } from '../types/common.ts';
import { logger } from '../utils/logger.ts';

app.webhooks.on(
  'pull_request_review.submitted',
  async ({ octokit, payload }) => {
    logger.info(
      `Received a review event for pull request  #${payload.pull_request.number}`
    );
    try {
      let pr = await PullRequestService.getPullRequestById(
        payload.pull_request?.id.toString()
      );

      if (!pr) {
        logger.info('Pull request not found');
        pr = await PullRequestService.initiatePullRequestCreationFlow(payload);
      }

      await ReviewService.createReview({
        id: payload.review.id.toString(),
        body: payload.review.body,
        created_at: payload.review.submitted_at
          ? new Date(payload.review.submitted_at)
          : new Date(),
        created_by_user_id: payload.review.user.id,
        created_by_user_login: payload.review.user.login,
        pull_request: pr,
      });

      logger.info('Review created successfully');
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
  }
);
