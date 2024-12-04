import { app } from '../config/appConfig.ts';
import {
  createResolutionComment,
  extractAndSendConflictFiles,
} from '../functions/textual-merge-conflict-resolution/textualMergeConflictResolution.ts';
import type { CustomError } from '../types/common.d.ts';
import { checkForMergeConflicts } from '../utils/checkForMergeConflicts.ts';
import { logger } from '../utils/logger.ts';

// Notify on merge conflicts
app.webhooks.on(
  ['pull_request.opened', 'pull_request.synchronize', 'pull_request.reopened'],
  async ({ octokit, payload }) => {
    logger.info(
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

        const resolution = await extractAndSendConflictFiles(
          octokit as any,
          payload.repository.owner.login,
          payload.repository.name,
          payload.pull_request.number
        );

        if (resolution === undefined) {
          logger.error('Failed to resolve the merge conflict');
          return;
        }

        for (const conflict of resolution) {
          await createResolutionComment(
            octokit as any,
            payload.repository.owner.login,
            payload.repository.name,
            payload.pull_request.number,
            conflict.filename,
            conflict.resolvedCode
          );
        }
      } else {
        if (
          payload.pull_request.labels.some(
            (label) => label.name === 'Merge Conflict'
          )
        ) {
          logger.info('Removing the merge conflict label');
          await octokit.rest.issues.removeLabel({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.pull_request.number,
            name: 'Merge Conflict',
          });

          await octokit.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.pull_request.number,
            body: 'The merge conflict has been resolved. This PR is now ready to be merged.✔️',
          });
        }
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
