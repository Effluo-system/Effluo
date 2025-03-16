import fs from 'fs';
import { app } from '../config/appConfig.ts';
import { PullRequestService } from '../services/pullRequest.service.ts';
import { CustomError } from '../types/common.d';
import { logger } from '../utils/logger.ts';
import { analyzePullRequest, analyzePullRequest2, analyzeConflicts } from '../functions/semantic-conflict-detection/semanticConflictDetection.ts';
import { calculateReviewDifficultyOfPR } from '../functions/workload-calculation/workloadCalculation.ts';
import { PullRequest } from '../entities/pullRequest.entity.ts';
import { AppDataSource } from '../server/server.ts';  
import { PrFeedback } from '../entities/prFeedback.entity.ts';  

const messageForNewPRs = fs.readFileSync('./src/messages/message.md', 'utf8');
const messageForNewLabel = fs.readFileSync('./src/messages/messageNewLabel.md', 'utf8');

const postAIValidationForm = async (octokit: any, owner: string, repo: string, issueNumber: number) => {
  const validationMessage = `
    ## AI Conflict Detection Results
    
    Our AI has analyzed this pull request and detected potential semantic conflicts.
    
    **Please validate this finding by commenting with one of these simple responses:**
    - \`#Confirm\` - If you confirm this is a conflict
    - \`#NotAConflict\` - If this is not a conflict (please add a brief explanation)
    
    *Note: Please use a new comment with just the tag at the beginning*
  `;
  
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: validationMessage,
  });
};

const logConflictFeedback = async (prNumber: number, conflictConfirmed: boolean, explanation: string | null) => {
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
  logger.info(`Received a pull request event for #${payload.pull_request.number}`);
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
    
    await PullRequestService.initiatePullRequestCreationFlow(payload, reviewDifficulty);
    
  } catch (error) {
    const customError = error as CustomError;
    if (customError.response) {
      logger.error(`Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`);
    } else {
      logger.error(customError.message || 'An unknown error occurred');
    }
  }
});


app.webhooks.on('issue_comment.created', async ({ octokit, payload }) => {
  logger.info(`Received a comment event for PR #${payload.issue.number}`);
  
  if (payload.comment.user.login.includes('bot') || payload.comment.user.type === 'Bot') {
    logger.info(`Skipping bot's own comment for PR #${payload.issue.number}`);
    return;
  }
  
  const commentBody = payload.comment.body.trim();
  
  if (commentBody.startsWith('#Confirm') || commentBody.startsWith('#NotAConflict')) {
    try {
      const { issue, comment } = payload;
      const prNumber = issue.number;
      
      let responseMessage = '';
      let conflictConfirmed = false;
      let explanation = null;

      if (commentBody.startsWith('#Confirm')) {
        responseMessage = 'The reviewer confirmed that this is a conflict.';
        conflictConfirmed = true;
        logger.info(`Confirmed conflict for PR #${prNumber}`);
        
        await octokit.rest.issues.addLabels({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: prNumber,
          labels: ['semantic-conflict']
        });
      } else {
        explanation = commentBody.replace('#NotAConflict', '').trim();
        responseMessage = 'The reviewer did not find a conflict.' + 
                         (explanation ? ` Reason: ${explanation}` : '');
        logger.info(`Not a conflict for PR #${prNumber}: ${explanation || 'No reason provided'}`);
      }

      await octokit.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: prNumber,
        body: `AI Conflict Validation Feedback: ${responseMessage}`,
      });

      logger.info(`Processed AI validation feedback for PR #${prNumber}: ${responseMessage}`);

      await logConflictFeedback(prNumber, conflictConfirmed, explanation);
      
    } catch (error) {
      const customError = error as CustomError;
      if (customError.response) {
        logger.error(`Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`);
      } else {
        logger.error(customError.message || 'An unknown error occurred');
      }
    }
  }
});

app.webhooks.on('pull_request.reopened', async ({ octokit, payload }) => {
  logger.info(`Received a pull request event for #${payload.pull_request.number}`);
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

    let pr = await PullRequestService.getPullRequestById(payload.pull_request.id.toString());
    if (!pr) {
      pr = await PullRequestService.initiatePullRequestCreationFlow(payload, reviewDifficulty);
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
      logger.error(`Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`);
    } else {
      logger.error(customError.message || 'An unknown error occurred');
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

