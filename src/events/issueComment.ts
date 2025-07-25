import { IssueCommentEvent } from '@octokit/webhooks-types';
import { Octokit } from 'octokit';
import { app } from '../config/appConfig.ts';
import { checkPriorityCommands } from '../functions/pr-prioritization/pr-prioritization.ts';
import { checkSemanticConflictCommands } from '../functions/semantic-conflict-detection/semanticConflictDetection.ts';
import { checkTextualConflictCommands } from '../functions/textual-merge-conflict-resolution/textualMergeConflictResolution.ts';
import { logger } from '../utils/logger.ts';

app.webhooks.on(
  ['issue_comment.created'],
  async ({
    octokit,
    payload,
  }: {
    octokit: Octokit;
    payload: IssueCommentEvent;
  }) => {
    // Only process comments on pull requests
    if (!payload.issue.pull_request) {
      return;
    }

    // Avoid processing comments from the bot itself
    if (payload.comment.user?.type === 'Bot') {
      return;
    }

    try {
      await checkTextualConflictCommands(octokit, payload);
    } catch (error) {
      logger.error(`Error processing commit resolution commands: ${error}`);
      return;
    }

    try {
      await checkPriorityCommands(octokit as any, payload);
    } catch (error) {
      logger.error(`Error processing PR prioritization: ${error}`);
      return;
    }

    try {
      await checkSemanticConflictCommands(octokit, payload);
    } catch (error) {
      logger.error(`Error handling user feedback: ${error}`);
      return;
    }
  }
);
