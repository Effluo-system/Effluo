import { app } from '../config/appConfig.ts';
import type { CustomError } from '../types/common.d.ts';
import { checkForMergeConflicts } from '../utils/checkForMergeConflicts.ts';
import { logger } from '../utils/logger.ts';

app.webhooks.on(
  'pull_request_review.submitted',
  async ({ octokit, payload }) => {
    logger.info(
      `Received a review event for pull request  #${payload.pull_request.number}`
    );
    try {
      console.log(JSON.stringify(payload));
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
