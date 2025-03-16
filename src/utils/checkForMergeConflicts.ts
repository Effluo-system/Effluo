import type { CustomError } from '../types/common.d.ts';
import { logger } from './logger.ts';

export async function checkForMergeConflicts(
  octokit: any,
  owner: any,
  repo: any,
  pull_number: any,
  retries = 5,
  retryDelay = 2500
) {
  for (let i = 0; i < retries; i++) {
    try {
      const { data: pullRequest } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
      });

      if (pullRequest.mergeable === null) {
        logger.info('Mergeable state is null. Retrying...');
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        return pullRequest.mergeable;
      }
    } catch (error) {
      const customError = error as CustomError;
      logger.error(`Error! ${customError.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}
