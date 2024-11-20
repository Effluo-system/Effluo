export async function checkForMergeConflicts(
  octokit,
  owner,
  repo,
  pull_number,
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
      console.error(`Error! ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}
