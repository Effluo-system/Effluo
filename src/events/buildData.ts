import { app } from '../config/appConfig.ts';
import { logger } from '../utils/logger.ts';
import { processBuildAndCheckDelay } from '../functions/pr-prioritization/buildFailure.ts';
import { CustomError } from '../types/common.d';
import type { WorkflowDispatchEvent } from '@octokit/webhooks-types/schema.d.ts';

// GitHub Actions workflow run event handler
app.webhooks.on('workflow_run', async ({ octokit, payload }) => {
  logger.info(`Received workflow run event for run #${payload.workflow_run.id}`);

  try {
    // Only process completed workflow runs
    if (payload.workflow_run.status === 'completed') {
      await processBuildAndCheckDelay(
        octokit as any,
        payload.repository.owner.login,
        payload.repository.name,
        payload.workflow_run.id
      );
    }
  } catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      logger.error(`Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`);
    } else {
      logger.error(customError.message || 'An unknown error occurred');
    }
  }
});

// Optional: Additional event for manual build triggers or other workflow events
app.webhooks.on('workflow_dispatch', async ({ octokit, payload }: { octokit: any; payload: WorkflowDispatchEvent }) => {
  logger.info(`Received manual workflow dispatch for ${payload.workflow || 'Unknown Workflow'}`);

  try {
    // For workflow_dispatch, we might not have a workflow_run immediately
    // So we'll use the repository information from the payload
    await processBuildAndCheckDelay(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      // Use a unique identifier or timestamp as a pseudo run ID
      Date.now()
    );
  } catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      logger.error(`Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`);
    } else {
      logger.error(customError.message || 'An unknown error occurred');
    }
  }
});