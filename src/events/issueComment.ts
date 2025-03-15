import { app } from '../config/appConfig.ts';
import {
  checkForCommitResolutionCommands,
  commitResolution,
} from '../functions/textual-merge-conflict-resolution/textualMergeConflictResolution.ts';
import { CustomError } from '../types/common';
import { logger } from '../utils/logger.ts';

app.webhooks.on('issue_comment.created', async ({ octokit, payload }) => {
  try {
    // Only process comments on PRs
    if (!payload.issue.pull_request) {
      return;
    }

    const pullNumber = payload.issue.number;
    logger.info(`Received comment on PR #${pullNumber}`);

    // Check if the comment contains a command to commit a resolution
    const commands = await checkForCommitResolutionCommands(
      octokit as any,
      payload.repository.owner.login,
      payload.repository.name,
      pullNumber
    );

    // If we found any commit commands, process them
    for (const command of commands) {
      // Only process the most recent command for this file
      if (command.comment_id === payload.comment.id) {
        await commitResolution(
          octokit as any,
          payload.repository.owner.login,
          payload.repository.name,
          pullNumber,
          command.filename
        );
      }
    }
  } catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      logger.error(
        `Error processing comment! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
      );
    } else {
      logger.error(error);
    }
  }
});
