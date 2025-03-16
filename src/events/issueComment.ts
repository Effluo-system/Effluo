import { app } from '../config/appConfig.ts';
import {
  checkForCommitResolutionCommands,
  resolveAllConflicts,
} from '../functions/textual-merge-conflict-resolution/textualMergeConflictResolution.ts';
import { MergeConflictService } from '../services/mergeConflict.service.ts';
import { RepoService } from '../services/repo.service.ts';
import { logger } from '../utils/logger.ts';

app.webhooks.on(['issue_comment.created'], async ({ octokit, payload }) => {
  // Only process comments on pull requests
  if (!payload.issue.pull_request) {
    return;
  }

  try {
    // Check for commit resolution commands
    const { applyAll, commentId, user, commandTimestamp } =
      await checkForCommitResolutionCommands(
        octokit as any,
        payload.repository.owner.login,
        payload.repository.name,
        payload.issue.number
      );

    // Process "apply all" command if found
    if (applyAll && commentId && commandTimestamp) {
      logger.info(
        `Processing apply all command from ${user} at ${commandTimestamp}`
      );

      // React to the comment to indicate we're processing it
      await octokit.rest.reactions.createForIssueComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        comment_id: commentId,
        content: 'eyes',
      });

      const success = await resolveAllConflicts(
        octokit as any,
        payload.repository.owner.login,
        payload.repository.name,
        payload.issue.number
      );

      // Add success/failure reaction
      await octokit.rest.reactions.createForIssueComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        comment_id: commentId,
        content: success ? '+1' : '-1',
      });

      // If the command was successful, update the timestamp in the database
      if (success) {
        const repoEntity = await RepoService.getRepoByOwnerAndName(
          payload.repository.owner.login,
          payload.repository.name
        );

        if (repoEntity) {
          await MergeConflictService.updateLastProcessedTimestamp(
            repoEntity.id,
            payload.issue.number,
            commandTimestamp
          );
        }
      }
    }
  } catch (error) {
    logger.error(`Error processing comment webhook: ${error}`);
  }
});
