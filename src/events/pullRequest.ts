import { app } from '../config/appConfig.ts';
import { CustomError } from '../types/common.d';
import fs from 'fs';

const messageForNewPRs = fs.readFileSync('./src/messages/message.md', 'utf8');
const messageForNewLabel = fs.readFileSync(
  './src/messages/messageNewLabel.md',
  'utf8'
);
// Subscribe to the "pull_request.opened" webhook event
app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
  console.log(
    `Received a pull request event for #${payload.pull_request.number}`
  );
  try {
    await octokit.rest.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body: messageForNewPRs,
    });
  } catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      console.error(
        `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
      );
    } else {
      console.error(customError.message || 'An unknown error occurred');
    }
  }
});

//Subscribe to "label.created" webhook events
app.webhooks.on('pull_request.labeled', async ({ octokit, payload }) => {
  try {
    if (!payload.sender.login.includes('bot')) {
      console.log(`Received a label event for #${payload?.label?.name}`);

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
      console.error(
        `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
      );
    } else {
      console.error(error);
    }
  }
});

// Notify the reviewer when a review is requested
// app.webhooks.on(
//   'pull_request.review_requested',
//   async ({ octokit, payload }) => {
//     console.log(
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
//         console.error(
//           `Error! Status: ${error.response.status}. Message: ${error.response.data.message}`
//         );
//       } else {
//         console.error(error);
//       }
//     }
//   }
// );
