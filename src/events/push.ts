import { app } from '../config/appConfig.ts';
import type { CustomError } from '../types/common.d.ts';
import { logger } from '../utils/logger.ts';

// Keep PRs up to date with the main branch
app.webhooks.on('push', async ({ octokit, payload }) => {
  logger.info(`Received a push event for ${payload.ref}`);
  if (payload.ref === 'refs/heads/main') {
    logger.info('Push event received for main branch');
    try {
      const { data: pullRequests } = await octokit.rest.pulls.list({
        owner: payload.repository?.owner?.name || '',
        repo: payload.repository.name,
        state: 'open',
        base: 'main',
      });

      pullRequests.forEach(async (pullRequest) => {
        try {
          logger.info(`Merging main into PR branch ${pullRequest.head.ref}`);
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
          logger.info('Merge conflict detected');
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
        logger.error(
          `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
        );
      } else {
        logger.error(error);
      }
    }
  }
});
