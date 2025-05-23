import { app } from '../config/appConfig.ts';
import { prioritizePullRequest , processPriorityFeedback } from '../functions/pr-prioritization/pr-prioritization.ts';
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

  // Avoid processing comments from the bot itself
  if (payload.comment.user?.type === 'Bot') {
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

    logger.info(`Processing comment webhook for PR: ${payload.issue.number}`);

    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const issueNumber = payload.issue.number;

    // Fetch all comments on the PR
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
    });

    // // Identify bot comments containing PR priority details
    // const botComments = comments.filter(
    //   (comment) =>
    //     comment.user?.type === 'Bot' &&
    //     comment.body?.includes('PR Priority:') &&
    //     comment.body?.includes('Priority Score:') &&
    //     comment.body?.includes('Deployment Note:')
    // );

    // // Delete old bot comments
    // for (const comment of botComments) {
    //   await octokit.rest.issues.deleteComment({
    //     owner,
    //     repo,
    //     comment_id: comment.id,
    //   });
    //   logger.info(`Deleted old bot comment: ${comment.id}`);
    // }

    //get the current comment
    const currentComment = payload.comment;

    //check if the comment is an priority feedback comment
    const isPriorityFeedbackComment = 
        currentComment.body?.toUpperCase().startsWith('CONFIRM') ||
        currentComment.body?.toUpperCase().startsWith('HIGH') ||
        currentComment.body?.toUpperCase().startsWith('MEDIUM') ||
        currentComment.body?.toUpperCase().startsWith('LOW')
    

    if (isPriorityFeedbackComment) {
      logger.info('Priority feedback comment found. Processing...');

      await processPriorityFeedback(
        octokit as any,
        payload.repository.owner.login,
        payload.repository.name,
        payload.issue.number)
    } else{
      await prioritizePullRequest(
        octokit as any,
        payload.repository.owner.login,
        payload.repository.name,
        payload.issue.number
      );
    }
  } catch (error) {
    logger.error(`Error processing comment webhook: ${error}`);
  }
});
