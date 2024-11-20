import type { CustomError } from '../types/common.d.ts';

export async function checkForMergeConflicts(
  octokit: any,
  owner: any,
  repo: any,
  pull_number: any,
  retries = 3,
  retryDelay = 5000
) {
  for (let i = 0; i < retries; i++) {
    try {
      const { data: pullRequest } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
      });

      if (pullRequest.mergeable !== null) {
        return pullRequest.mergeable;
      }
    } catch (error) {
      const customError = error as CustomError;
      console.error(`Error! ${customError.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}
