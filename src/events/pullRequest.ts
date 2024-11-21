import { app } from '../config/appConfig.ts';
import { PullRequestService } from '../services/pullRequest.service.ts';
import { CustomError } from '../types/common.d';
import fs from 'fs';
import { logger } from '../utils/logger.ts';

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
    await PullRequestService.createPullRequest({
      id: payload.pull_request.id,
      title: payload.pull_request.title,
      body: payload.pull_request.body,
      assignee: payload.pull_request.assignee?.login || null,
      assignees: payload.pull_request.assignees.map(
        (assignee) => assignee.login
      ),
      created_at: new Date(payload.pull_request.created_at),
      closed_at: payload.pull_request.closed_at,
      number: payload.pull_request.number,
      repository: payload.repository.full_name,
      created_by_user_id: payload.pull_request.user.id,
      created_by_user_login: payload.pull_request.user.login,
      url: payload.pull_request.html_url,
      reviews: [],
    });
    logger.info('Pull request created successfully');
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
app.webhooks.on('pull_request.labeled', async ({ octokit, payload }) => {
  try {
    if (!payload.sender.login.includes('bot')) {
      logger.info(`Received a label event for #${payload?.label?.name}`);

      await octokit.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.pull_request.number,
        body: messageForNewLabel,
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
