import { app } from '../config/appConfig.ts';
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
        payload.pull_request?.id
      );

      if (!pr) {
        logger.info('Pull request not found');
        pr = await PullRequestService.createPullRequest({
          id: payload.pull_request.id,
          title: payload.pull_request.title,
          body: payload.pull_request.body,
          assignee: payload.pull_request.assignee?.login || null,
          assignees: payload.pull_request.assignees.map(
            (assignee) => assignee.login
          ),
          created_at: new Date(payload.pull_request.created_at),
          closed_at: payload.pull_request.closed_at
            ? new Date(payload.pull_request.closed_at)
            : null,
          number: payload.pull_request.number,
          repository: payload.repository.full_name,
          created_by_user_id: payload.pull_request.user.id,
          created_by_user_login: payload.pull_request.user.login,
          url: payload.pull_request.html_url,
          reviews: [],
        });
        logger.info('Pull request created successfully');
      }

      await ReviewService.createReview({
        id: payload.review.id,
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
