import { app } from '../config/appConfig.ts';
import type { CustomError } from '../types/common.d.ts';
import { checkForMergeConflicts } from '../utils/checkForMergeConflicts.ts';

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
