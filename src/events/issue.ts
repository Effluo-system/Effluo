import { app } from '../config/appConfig.ts';
import { Difficulty } from '../constants/common.constants.ts';
import { analyzeReviewers } from '../functions/analyse-reviewers/analyseReviewers.ts';
import { IssueService } from '../services/issue.service.ts';
import { OwnerService } from '../services/owner.service.ts';
import { PullRequestService } from '../services/pullRequest.service.ts';
import { RepoService } from '../services/repo.service.ts';
import { ReviewService } from '../services/review.service.ts';
import type { CustomError } from '../types/common.ts';
import { logger } from '../utils/logger.ts';

app.webhooks.on(
  ['issues.opened', 'issues.reopened'],
  async ({ octokit, payload }) => {
    logger.info(`Received a new issue ${payload.issue}`);
    try {
      await IssueService.initiateCreationFlow(payload);
      logger.info('Issue created successfully');
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
  ['issues.closed', 'issues.deleted'],
  async ({ octokit, payload }) => {
    logger.info(`Received a close issue event ${payload.issue}`);
    try {
      await IssueService.deleteIssue(payload?.issue?.id?.toString());
      logger.info('Issue reopened successfully');
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
  ['issues.unassigned', 'issues.assigned'],
  async ({ octokit, payload }) => {
    logger.info(`Received a reopen issue event ${payload.issue}`);
    try {
      await IssueService.updateAssignees(payload);
      logger.info('Issue assignees updated successfully');
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
