import fs from 'fs';
import { app } from '../config/appConfig.ts';
import { PullRequestService } from '../services/pullRequest.service.ts';
import { CustomError } from '../types/common.d';
import { logger } from '../utils/logger.ts';
import {
  analyzePullRequest,
  analyzePullRequest2,
  analyzeConflicts,
} from '../functions/semantic-conflict-detection/semanticConflictDetection.ts';
import { calculateReviewDifficultyOfPR } from '../functions/workload-calculation/workloadCalculation.ts';
import { PullRequest } from '../entities/pullRequest.entity.ts';
import { AppDataSource } from '../server/server.ts';  
import { PrFeedback } from '../entities/prFeedback.entity.ts';  
import { prioritizePullRequest} from '../functions/pr-prioritization/pr-prioritization.ts';
import { PRReviewRequestService } from '../services/prReviewRequest.service.ts';

const messageForNewPRs = fs.readFileSync('./src/messages/message.md', 'utf8');
const messageForNewLabel = fs.readFileSync(
  './src/messages/messageNewLabel.md',
  'utf8'
);

const postAIValidationForm = async (
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number
) => {
  const validationMessage = `
  ✅ **AI Conflict Detection Results** ✅  
  Our AI has analyzed this pull request and found potential **semantic conflicts**.

  ### _What should you do next?_
  📌 Please review the AI's findings and provide feedback by commenting with:
  - \`#Confirm\` → If you agree this is a conflict.
  - \`#NotAConflict\` → If you believe there’s no conflict _(please add a brief explanation)_.

  ✍️ _Tip: Reply with one of the above tags as a separate comment._
  `;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: validationMessage,
  });
};

const logConflictFeedback = async (
  prNumber: number,
  conflictConfirmed: boolean,
  explanation: string | null
) => {
  try {
    const feedback = new PrFeedback();
    feedback.pr_number = prNumber;
    feedback.conflict_confirmed = conflictConfirmed;
    feedback.explanation = explanation;

    const feedbackRepository = AppDataSource.getRepository(PrFeedback);
    await feedbackRepository.save(feedback);

    logger.info('Feedback saved successfully');
  } catch (error) {
    logger.error('Error saving feedback:', error);
  }
};

app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
  logger.info(
    `Received a pull request event for #${payload.pull_request.number}`
  );
  try {
    await octokit.rest.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body: messageForNewPRs,
    });

    const files1 = await analyzePullRequest(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const files2 = await analyzePullRequest2(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const conflictAnalysis = await analyzeConflicts(files2);
    const reviewDifficulty = await calculateReviewDifficultyOfPR(files1);

    await octokit.rest.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body: conflictAnalysis,
    });

    await postAIValidationForm(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number
    );

    await PullRequestService.initiatePullRequestCreationFlow(
      payload,
      reviewDifficulty
    );
  } catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      logger.error(
        `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
      );
    } else {
      logger.error(customError.message || 'An unknown error occurred');
    }
  }
});

app.webhooks.on('issue_comment.created', async ({ octokit, payload }) => {
 // logger.info(`Received a comment event for PR #${payload.issue.number}`);
  
  if (payload.comment.user.login.includes('bot') || payload.comment.user.type === 'Bot') {
   // logger.info(`Skipping bot's own comment for PR #${payload.issue.number}`);
    return;
  }

  const commentBody = payload.comment.body.trim();

  if (
    commentBody.startsWith('#Confirm') ||
    commentBody.startsWith('#NotAConflict')
  ) {
    try {
      const { issue, comment } = payload;
      const prNumber = issue.number;

      let responseMessage = '';
      let conflictConfirmed = false;
      let explanation = null;

      if (commentBody.startsWith('#Confirm')) {
        responseMessage = `🚨 **AI Conflict Validation Feedback** 🚨\n\nThe reviewer has confirmed that **this is a conflict**. The \`semantic-conflict\` label has been applied.\n\nThank you for your review! ✅`;
        conflictConfirmed = true;
        logger.info(`Confirmed conflict for PR #${prNumber}`);

        await octokit.rest.issues.addLabels({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: prNumber,
          labels: ['semantic-conflict'],
        });
      } else {
        explanation = commentBody.replace('#NotAConflict', '').trim();
        responseMessage = `📝 **AI Conflict Validation Feedback** 📝\n\nThe reviewer has determined that **this is not a conflict**.\n🛠 **Reason:** ${explanation ? explanation : '_No reason provided_'}\n\nThank you for your input! 🙌`;
        logger.info(`Not a conflict for PR #${prNumber}: ${explanation || 'No reason provided'}`);
      }

      await octokit.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: prNumber,
        body: `AI Conflict Validation Feedback: ${responseMessage}`,
      });

      logger.info(
        `Processed AI validation feedback for PR #${prNumber}: ${responseMessage}`
      );

      await logConflictFeedback(prNumber, conflictConfirmed, explanation);
    } catch (error) {
      const customError = error as CustomError;
      if (customError.response) {
        logger.error(
          `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
        );
      } else {
        logger.error(customError.message || 'An unknown error occurred');
      }
    }
  }
});

app.webhooks.on('pull_request.reopened', async ({ octokit, payload }) => {
  logger.info(
    `Received a pull request event for #${payload.pull_request.number}`
  );
  try {
    const files1 = await analyzePullRequest(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const files2 = await analyzePullRequest2(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.base.ref,
      payload.pull_request.head.ref
    );

    const conflictAnalysis = await analyzeConflicts(files2);
    const reviewDifficulty = await calculateReviewDifficultyOfPR(files1);

    let pr = await PullRequestService.getPullRequestById(
      payload.pull_request.id.toString()
    );
    if (!pr) {
      pr = await PullRequestService.initiatePullRequestCreationFlow(
        payload,
        reviewDifficulty
      );
    } else {
      pr.reviewDifficulty = reviewDifficulty;
      await PullRequestService.updatePullRequest(pr);
    }

    await octokit.rest.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body: conflictAnalysis,
    });

    await postAIValidationForm(
      octokit,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number
    );
  } catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      logger.error(
        `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
      );
    } else {
      logger.error(customError.message || 'An unknown error occurred');
    }
  }
});

//Subscribe to "label.created" webhook events
app.webhooks.on(
  ['pull_request.labeled', `pull_request.unlabeled`],
  async ({ octokit, payload }) => {
    try {
      if (!payload.sender.login.includes('bot')) {
        logger.info(`Received a label event for #${payload?.label?.name}`);

        await octokit.rest.issues.createComment({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.pull_request.number,
          body: messageForNewLabel,
        });

        let pr = await PullRequestService.getPullRequestById(
          payload?.pull_request?.id.toString()
        );
        if (!pr) {
          logger.info(`Pull request not found. Creating new pull request ...`);
          const files = await analyzePullRequest(
            octokit,
            payload.repository.owner.login,
            payload.repository.name,
            payload.pull_request.number,
            payload.pull_request.base.ref,
            payload.pull_request.head.ref
          );

          const reviewDifficulty = await calculateReviewDifficultyOfPR(files);
          pr = await PullRequestService.initiatePullRequestCreationFlow(
            payload,
            reviewDifficulty
          );
        }
        pr.labels = payload?.pull_request?.labels?.map((labels) => labels.name);
        await PullRequestService.updatePullRequest(pr);
        logger.info(`Pull request updated successfully`);
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

app.webhooks.on('pull_request.closed', async ({ octokit, payload }) => {
  try {
    const requests = await PRReviewRequestService.findByPRId(
      payload?.pull_request?.id?.toString()
    );
    if (requests) {
      await PRReviewRequestService.deleteRequest(requests);
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
});

// Notify the reviewer when a review is requested
// app.webhooks.on(
//   'pull_request.review_requested',
//   async ({ octokit, payload }) => {
//     logger.info(
//       `Received a review requested event for #${payload.pull_request.number}`
//     );
//     try {
//       setTimeout(async () => {
//         await octokit.rest.issues.createComment({
//           owner: payload.repository.owner.login,
//           repo: payload.repository.name,
//           issue_number: payload.pull_request.number,
//           body: `@${payload.requested_reviewer.login} you have been requested to review this PR🚀. Please take a look.`,
//         });
//       }, 5000);
//     } catch (error) {
//       if (error.response) {
//         logger.error(
//           `Error! Status: ${error.response.status}. Message: ${error.response.data.message}`
//         );
//       } else {
//         logger.error(error);
//       }
//     }
//   }
// );

app.webhooks.on('pull_request', async ({ octokit, payload }) => {
  logger.info(
    `Received a pull request event for #${payload.pull_request.number}`
  );
  try {
    await prioritizePullRequest(
      octokit as any,
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number
    );
  }
  catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      logger.error(
        `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
      );
    } else {
      logger.error(error);
    }
  }
});
