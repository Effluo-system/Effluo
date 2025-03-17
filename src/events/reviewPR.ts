import { app } from '../config/appConfig.ts';
import { PRReviewRequest } from '../entities/prReviewRequest.entity.ts';
import { analyzeReviewers } from '../functions/analyse-reviewers/analyseReviewers.ts';
import { analyzePullRequest } from '../functions/semantic-conflict-detection/semanticConflictDetection.ts';
import { calculateReviewDifficultyOfPR } from '../functions/workload-calculation/workloadCalculation.ts';
import { PRReviewRequestService } from '../services/prReviewRequest.service.ts';
import { PullRequestService } from '../services/pullRequest.service.ts';
import { ReviewService } from '../services/review.service.ts';
import type { CustomError } from '../types/common.ts';
import { logger } from '../utils/logger.ts';
import { User } from '@octokit/webhooks-types';

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

      const reviewRequest = await PRReviewRequestService.findByPRId(
        payload?.pull_request?.id?.toString()
      );
      if (!reviewRequest) {
        logger.error('Review request not found');
      } else {
        let assignees = reviewRequest.assignees?.filter(
          (person) => payload?.review?.user?.login !== person
        );
        if (assignees?.length && assignees?.length > 0) {
          reviewRequest.assignees = assignees;
          await PRReviewRequestService.updatePRReviewRequest(reviewRequest);
        } else {
          await PRReviewRequestService.deleteRequest(reviewRequest);
        }
      }
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

app.webhooks.on(
  ['pull_request.review_requested', 'pull_request.review_request_removed'],
  async ({ octokit, payload }) => {
    logger.info(
      `Review requested for pull request  #${payload.pull_request.number}`
    );
    try {
      let pr = await PullRequestService.getPullRequestById(
        payload.pull_request?.id.toString()
      );

      if (!pr) {
        logger.info('Pull request not found');
        const files = await analyzePullRequest(
          octokit,
          payload?.repository?.owner?.login,
          payload?.repository?.name,
          payload?.pull_request?.number,
          payload?.pull_request?.base?.ref,
          payload?.pull_request?.head?.ref
        );
        const reviewDifficulty = await calculateReviewDifficultyOfPR(files);
        pr = await PullRequestService.initiatePullRequestCreationFlow(
          payload,
          reviewDifficulty
        );
      } else {
        pr.assignees = payload?.pull_request?.requested_reviewers
          .filter((person): person is User => 'login' in person) // Type guard to ensure `login` exists
          .map((person) => person.login);
        await PullRequestService.updatePullRequest(pr);
        const request = await PRReviewRequestService.findByPRId(
          payload?.repository?.id?.toString()
        );
        if (!request) {
          await PRReviewRequestService.createPRReviewRequest({
            assignees: payload?.pull_request?.requested_reviewers
              .filter((person): person is User => 'login' in person) // Type guard to ensure `login` exists
              .map((person) => person.login),
            labels: payload?.pull_request?.labels?.map((label) => label?.name),
            weight: pr?.reviewDifficulty,
            pr: pr,
          });
        } else {
          request.assignees = [
            ...(request?.assignees ?? []),
            ...payload?.pull_request?.requested_reviewers
              .filter((person): person is User => 'login' in person)
              .map((person) => person.login),
          ];
        }
      }
      logger.info('Review Request created successfully');
    } catch (error) {
      const customError = error as CustomError;
      if (customError.response) {
        logger.error(
          `Error! Status: ${customError?.response?.status}. Message: ${customError?.response?.data?.message}`
        );
      } else {
        logger.error(customError.message || 'An unknown error occurred');
      }
    }
  }
);
