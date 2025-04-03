import { Octokit } from '@octokit/rest';
import { logger } from '../../utils/logger.ts';
import { PullRequestService } from '../../services/pullRequest.service.ts';
import { AppDataSource } from '../../server/server.ts';
import { PrPriorityFeedback } from '../../entities/prPriorityFeedback.entity.ts';

interface PullRequestEventData {
  number: number;
  title: string;
  description: string;
  author: {
    login: string;
    association: string;
  };
  labels: string[];
  base: {
    ref: string;
    sha: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  changedFiles: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
  }[];
  comments: {
    author: string;
    body: string;
    createdAt: string;
  }[];
  reviewers: string[];
  createdAt: string;
  updatedAt: string;
}

type ValidPriority = "HIGH" | "MEDIUM" | "LOW" | null;


/**
 * Extract comprehensive PR data when a PR is created or updated
 * 
 * @param octokit Octokit instance
 * @param owner Repository owner
 * @param repo Repository name
 * @param pullNumber PR number
 * @returns Processed PR data
 */
export async function extractPullRequestData(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PullRequestEventData | undefined> {
  try {
    logger.info(`Extracting data for PR #${pullNumber} in ${owner}/${repo}`);

    // Get PR details
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Get list of files in PR
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Get PR comments
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
    });

    // Get reviewers
    const { data: requestedReviewers } = await octokit.rest.pulls.listRequestedReviewers({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Map files to required structure
    const changedFiles = files.map(file => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes
    }));

    // Map comments
    const commentData = comments.map(comment => ({
      author: comment.user?.login || 'unknown',
      body: comment.body || '',
      createdAt: comment.created_at
    }));

    // Extract reviewers' logins
    const reviewers = [
      ...(requestedReviewers.users?.map(user => user.login) || []),
      ...(requestedReviewers.teams?.map(team => team.name) || [])
    ];

    // Construct PR data
    const prData: PullRequestEventData = {
      number: pr.number,
      title: pr.title,
      description: pr.body || '',
      author: {
        login: pr.user?.login || 'unknown',
        association: pr.author_association
      },
      labels: pr.labels.map(label => typeof label === 'string' ? label : label.name || ''),
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha
      },
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha
      },
      changedFiles,
      comments: commentData,
      reviewers,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at
    };

    logger.info(`Successfully extracted data for PR #${pullNumber}`, {
      title: prData.title,
      filesCount: prData.changedFiles.length,
      commentsCount: prData.comments.length
    });

    return prData;
  } catch (error) {
    logger.error(`Failed to extract data for PR #${pullNumber}:`, error);
    return undefined;
  }
}

/**
 * Convert PullRequestEventData to the format expected by the PR Prioritizer model
 * 
 * @param prData PR data in GitHub format
 * @returns Transformed data in the format expected by prioritizer
 */
export function convertToPrioritizerFormat(prData: PullRequestEventData): any {
  // Calculate total changes
  const totalAdditions = prData.changedFiles.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = prData.changedFiles.reduce((sum, file) => sum + file.deletions, 0);
  
  // Combine PR description and all comments into a single body text for analysis
  const commentBodies = prData.comments.map(comment => comment.body).join('\n\n');
  const fullBody = `${prData.description || ''}\n\n${commentBodies}`;
  
  // Create the transformed data object
  return {
    pull_requests: [{
      id: `PR${prData.number}`,
      title: prData.title,
      body: fullBody,
      author_association: prData.author.association,
      comments: prData.comments.length,
      additions: totalAdditions,
      deletions: totalDeletions,
      changed_files: prData.changedFiles.length
    }]
  };
}

/**
 * Process PR data by sending it to Flask service for prioritization analysis
 * 
 * @param prData PR data to be processed
 * @returns Processing result
 */
export async function sendPRDataForProcessing(
  prData: PullRequestEventData
): Promise<{ status: string; priority?: string; score?: number } | undefined> {
  try {
    const url = `${process.env.FLASK_URL}/prioritize-pr`;
    logger.info(`Sending PR #${prData.number} data to: ${url}`);

    // Convert to the format expected by the prioritizer
    const convertedData = convertToPrioritizerFormat(prData);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(convertedData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
    }

    const result = await response.json();
    
    // Extract the priority and confidence from the response
    let priority = 'uncertain';
    let score = 0;
    
    if (result.status === 'success' && result.predictions && result.predictions.length > 0) {
      const prediction = result.predictions[0];
      priority = prediction.predicted_priority.toLowerCase();
      score = Math.round(prediction.confidence * 100);
    }
    
    logger.info(`Successfully processed PR #${prData.number}`, {
      priority: priority,
      score: score
    });

    // Store the predicted priority in the database
    await storePredictedPriority(prData.number, priority);
    
    return {
      status: 'success',
      priority: priority,
      score: score
    };
  } catch (error) {
    logger.error(`Failed to send PR #${prData.number} data to Flask server:`, error);
    return undefined;
  }

  async function storePredictedPriority(prID : number, predictedPiority: string) {
    try{

      const validPriorities: ValidPriority[] = ["HIGH", "MEDIUM", "LOW", null];
      const priority = validPriorities.includes(predictedPiority.toUpperCase() as ValidPriority)
      ? (predictedPiority.toUpperCase() as ValidPriority)
      : null;

      const feedbackRepository = AppDataSource.getRepository(PrPriorityFeedback);

      const feedback = await feedbackRepository.findOneBy({ pr_number : prID });

      if (!feedback) {
        logger.info(`No existing feedback found for PR #${prID}, creating new entry`);
        // Create a new feedback entry if it doesn't exist
        const newFeedback = new PrPriorityFeedback();
        newFeedback.pr_number = prID;
        newFeedback.predicted_priority = priority;
        newFeedback.priority_confirmed = false;
        newFeedback.actual_priority = null;
        await feedbackRepository.save(newFeedback);
        return; 
        }
      
      const updateResult = await feedbackRepository
      .createQueryBuilder()
      .update(PrPriorityFeedback)
      .set({ predicted_priority: priority })
      .where("pr_number = :prNumber", { prNumber: prID })
      .execute();

    if (updateResult.affected && updateResult.affected > 0) {
      logger.info(`Successfully updated predicted priority for PR #${prID} to ${priority}`);
    } else {
      logger.warn(`PR #${prID} not found for updating priority`);
    }
    }
    catch (error) {
      logger.error(`Failed to store predicted priority for PR #${prID}:`, error);
    }
    
  }
}

/**
 * Create a comment on a PR with its priority assessment
 * Only creates comment if PR is open
 */
/**
 * Create a comment on a PR with its priority assessment
 * and request user feedback for correction.
 */
export async function createPriorityComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  priority: string,
  score: number
) {
  try {
    // First check if the PR is open
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Don't create comment if PR is closed
    if (pr.state !== "open") {
      logger.info(`Skipping priority comment for PR #${pullNumber} as it is ${pr.state}`);
      return false;
    }

    // Fetch all comments on the PR
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
    });

    // Identify bot comments containing PR priority details 
    const botComments = comments.filter(comment => 
      comment.user?.type === 'Bot' && 
      comment.body?.includes('PR Priority:')
    );
    logger.info(`Found ${botComments.length} bot comments`);

    //Identify user feedbacks on priority
    const feedbackComments = comments.filter(comment => 
      comment.user?.type !== 'Bot' && 
      ["CONFIRMED", "HIGH", "MEDIUM", "LOW"].some(priority => 
        comment.body?.toUpperCase().includes(priority)
      )
    );

   
      for (const comment of feedbackComments) {
        await octokit.rest.issues.deleteComment({
          owner,
          repo,
          comment_id: comment.id,
        });
        logger.info(`Deleted old confirmation comment: ${comment.id}`);
      }
      
   

    // Delete old bot comments
    for (const comment of botComments) {
      await octokit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: comment.id,
      });
      logger.info(`Deleted old bot comment: ${comment.id}`);
    }

    // Set emoji based on priority
    let priorityEmoji = '';
    switch (priority) {
      case 'high':
        priorityEmoji = '🔴';
        break;
      case 'medium':
        priorityEmoji = '🟠';
        break;
      case 'low':
        priorityEmoji = '🟢';
        break;
      default:
        priorityEmoji = '❓';
    }

    // Create deployment message
    const deploymentMessages: Record<string, string> = {
      high: `🚨 **Deployment note**: This PR should be prioritized for deployment. Please review and merge ASAP.`,
      medium: `⚖️ **Deployment note**: This PR follows the standard deployment process.`,
      low: `🕒 **Deployment note**: This PR is non-urgent and can be scheduled for a later deployment.`,
    };

    const deploymentMessage = deploymentMessages[priority] || `🤔 **Deployment note**: Please review manually.`;

    // Construct the comment body with feedback options
    const commentBody = `
${priorityEmoji} **PR Priority: ${priority.toUpperCase()}**

📊 **Priority Score**: ${score}/100

${deploymentMessage}

---

### 📝 **Is this priority correct?**  
Please confirm by replying with:  
- ✅ **Confirmed** (if correct)  
- ❌ **Incorrect - Provide Actual Priority** (e.g., "Actual Priority: High")  

_Example reply: "Medium"_

`;

// Post comment on the PR
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: commentBody
    });

    logger.info(`Successfully created priority comment for PR #${pullNumber}`);
    return true;
  } catch (error) {
    logger.error(`Failed to create priority comment for PR #${pullNumber}:`, error);
    return false;
  }
}

/**
 * Full workflow for processing a PR - extract data, analyze, and comment
 */
export async function prioritizePullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<void> {
  try {
    // Step 1: Extract PR data
    logger.info(`Starting full workflow for PR #${pullNumber}`);
    const prData = await extractPullRequestData(octokit, owner, repo, pullNumber);
    if (!prData) {
      logger.error(`Failed to extract data for PR #${pullNumber}`);
      return;
    }
    
    // Step 2: Send for processing
    const result = await sendPRDataForProcessing(prData);
    if (!result || result.status !== 'success') {
      logger.error(`Failed to process data for PR #${pullNumber}`);
      return;
    }
    
    // Step 3: Add comment with priority
    if (result.priority && result.score) {
      await createPriorityComment(
        octokit, 
        owner, 
        repo, 
        pullNumber, 
        result.priority, 
        result.score
      );
    }

    await processPriorityFeedback(
          octokit as any,
          owner,
          repo,
          pullNumber,
        );
    
    logger.info(`Successfully completed full workflow for PR #${pullNumber}`);
  } catch (error) {
    logger.error(`Error in PR #${pullNumber} processing workflow:`, error);
  }
}

export async function processPriorityFeedback(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
) {
  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
    });

    for (const comment of comments) {
      const commentText = comment.body?.trim().toUpperCase();
      const feedbackRepository = AppDataSource.getRepository(PrPriorityFeedback);
      const feedback = await feedbackRepository.findOneBy({ pr_number: pullNumber });

      if (commentText?.includes('CONFIRMED')) {
        logger.info(`Feedback confirmed for PR #${pullNumber}`);
        const priority_confirmed = true;
       
        const actual_priority = feedback?.predicted_priority;
        if (feedback) {
          await feedbackRepository.update(feedback.id, { priority_confirmed, actual_priority });
          logger.info(`Updated feedback for PR #${pullNumber}: confirmed priority`);
        } else {
          logger.warn(`No feedback found for PR #${pullNumber}`);
        }
        
      }

      if (commentText === 'HIGH'||commentText === 'MEDIUM'||commentText === 'LOW') {
        logger.info(`Feedback received for PR #${pullNumber}: ${commentText}`);
        const actual_priority = commentText as ValidPriority;
        const predicted_priority = feedback?.predicted_priority;

        if (feedback) {
          const priority_confirmed = true;
          await feedbackRepository.update(feedback.id, { predicted_priority,priority_confirmed, actual_priority });
          logger.info(`Updated feedback for PR #${pullNumber}: actual priority set to ${actual_priority}`);
        } else {
          logger.warn(`No feedback found for PR #${pullNumber}`);
        }
      }
    }
  } catch (error) {
    logger.error(`Error processing feedback for PR #${pullNumber}:`, error);
  }
}
