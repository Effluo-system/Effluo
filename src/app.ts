import { createNodeMiddleware, Webhooks } from '@octokit/webhooks';
import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';
import { App as GitHubApp, Octokit } from 'octokit';
import {
  GetResponseTypeFromEndpointMethod,
  GetResponseDataTypeFromEndpointMethod,
} from '@octokit/types';
import { checkForMergeConflicts } from './util/utils.js';
import type { CustomError } from './types/common.d.ts';

// Load environment variables from .env file
dotenv.config();

// Set configured values
const appId = parseInt(process.env.APP_ID || '0', 10);
const privateKeyPath = process.env.PRIVATE_KEY_PATH || '';
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const secret = process.env.WEBHOOK_SECRET || '';
const enterpriseHostname = process.env.ENTERPRISE_HOSTNAME;
const messageForNewPRs = fs.readFileSync('./src/messages/message.md', 'utf8');
const messageForNewLabel = fs.readFileSync(
  './src/messages/messageNewLabel.md',
  'utf8'
);

// Create an authenticated Octokit client authenticated as a GitHub App
const app = new GitHubApp({
  appId,
  privateKey,
  webhooks: {
    secret,
  },
  ...(enterpriseHostname && {
    Octokit: Octokit.defaults({
      baseUrl: `https://${enterpriseHostname}/api/v3`,
    }),
  }),
});

// Optional: Get & log the authenticated app's name
const { data } = await app.octokit.request('/app');

// Read more about custom logging: https://github.com/octokit/core.js#logging
app.octokit.log.debug(`Authenticated as '${data.name}'`);

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

//Subscribe to "label.created" webhook event
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

// Keep PRs up to date with the main branch
app.webhooks.on('push', async ({ octokit, payload }) => {
  console.log(`Received a push event for ${payload.ref}`);
  if (payload.ref === 'refs/heads/main') {
    console.log('Push event received for main branch');
    try {
      const { data: pullRequests } = await octokit.rest.pulls.list({
        owner: payload.repository?.owner?.name || '',
        repo: payload.repository.name,
        state: 'open',
        base: 'main',
      });

      pullRequests.forEach(async (pullRequest) => {
        try {
          console.log(`Merging main into PR branch ${pullRequest.head.ref}`);
          await octokit.rest.repos.merge({
            owner: payload.repository?.owner?.name || '',
            repo: payload.repository.name,
            base: pullRequest.head.ref,
            head: 'main',
            commit_message: `Merging main into PR branch ${pullRequest.head.ref} (Automatic🚀)`,
          });
          await octokit.rest.issues.createComment({
            owner: payload.repository?.owner?.name || '',
            repo: payload.repository.name,
            issue_number: pullRequest.number,
            body: 'This PR has been updated with the latest changes from the main branch.✔️',
          });
        } catch (error) {
          console.log('Merge conflict detected');
          await octokit.rest.issues.addLabels({
            owner: payload.repository?.owner?.name || '',
            repo: payload.repository.name,
            issue_number: pullRequest.number,
            labels: ['Merge Conflict'],
          });
        }
      });
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
  }
});

// Notify on merge conflicts
app.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
  console.log(
    `Received a synchronize event for #${payload.pull_request.number}`
  );
  try {
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
        console.log('Removing the merge conflict label');
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
      console.error(
        `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
      );
    } else {
      console.error(error);
    }
  }
});

// Optional: Handle errors
app.webhooks.onError((error) => {
  if (error.name === 'AggregateError') {
    // Log Secret verification errors
    console.log(`Error processing request: ${error.event}`);
  } else {
    console.log(error);
  }
});

// Launch a web server to listen for GitHub webhooks
const port = process.env.PORT || 3000;
const path = '/api/webhook';
const localWebhookUrl = `http://localhost:${port}${path}`;

// See https://github.com/octokit/webhooks.js/#createnodemiddleware for all options
const middleware = createNodeMiddleware(app.webhooks as unknown as Webhooks, {
  path,
});

http.createServer(middleware).listen(port, () => {
  console.log(`Server is listening for events at: ${localWebhookUrl}`);
  console.log('Press Ctrl + C to quit.');
});
