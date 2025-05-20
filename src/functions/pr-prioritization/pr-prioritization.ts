import { Octokit } from '@octokit/rest';
import { logger } from '../../utils/logger.ts';
import { PullRequestService } from '../../services/pullRequest.service.ts';
import { AppDataSource } from '../../server/server.ts';
import { PrPriorityFeedback } from '../../entities/prPriorityFeedback.entity.ts';
import path from 'path';
import fs from 'fs';
import { FindOptionsWhere , In } from 'typeorm';
import { createObjectCsvWriter } from '../../utils/csvWriter.ts';

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

interface RLModelResponse{
  success: boolean;
  message: string;
  modelUpdated?: boolean;
}

interface ExtendedPrPriorityFeedback extends PrPriorityFeedback {
  processed_by_rl?: boolean;
  rl_processed_at?: Date;
}


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
      per_page: 100,
      sort: 'created',
      direction: 'desc',
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

    logger.info('extracted comments : ', commentData);

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
    // const PR = await PullRequestService.getPullRequestById(prData.number.toString());
    //  if (!PR) {
    //   logger.error(`Repository not found for PR #${prData.number}`);
    //   return undefined;
    // }

    // const reporsitoryName = PR.repository;
    
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

      const newPriorityPrediction = new PrPriorityFeedback();
      const feedbackRepository = AppDataSource.getRepository(PrPriorityFeedback);

      const commentBodies = prData.comments.map(comment => comment.body).join('\n\n'); 
      const fullBody = `${prData.description || ''}\n\n${commentBodies}`;
      logger.info(`Full body: ${fullBody}`);

      newPriorityPrediction.pr_number = prData.number;
      newPriorityPrediction.predicted_priority = priority.toUpperCase() as ValidPriority;
      newPriorityPrediction.predicted_priority_score = score;
      newPriorityPrediction.priority_confirmed = false;
      newPriorityPrediction.actual_priority = null;
      newPriorityPrediction.title = prData.title;
      newPriorityPrediction.owner = prData.author.login;
      newPriorityPrediction.body = fullBody;
      newPriorityPrediction.comments = prData.comments.length;
      newPriorityPrediction.total_additions = convertedData.pull_requests[0].additions;
      newPriorityPrediction.changed_files_count = convertedData.pull_requests[0].changed_files;
      newPriorityPrediction.total_deletions = convertedData.pull_requests[0].deletions;
      newPriorityPrediction.author_association = prData.author.association;
      // newPriorityPrediction.repo = reporsitoryName.toString();
      newPriorityPrediction.created_at = new Date(prData.createdAt);
      newPriorityPrediction.updated_at = new Date(prData.updatedAt);
      
      await feedbackRepository.save(newPriorityPrediction);
      logger.info(`Stored predicted priority for PR #${prData.number}: ${priority}`);
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
      ["CONFIRM", "HIGH", "MEDIUM", "LOW"].some(priority => 
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
- ✅ **Confirm** (if correct)  
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
    logger.info(`Processing feedback for PR #${pullNumber}`);
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
    });

    let feedbackReceived = false;
    let feedbackType = '';

    for (const comment of comments) {
      const commentText = comment.body?.trim().toUpperCase();
      const feedbackRepository = AppDataSource.getRepository(PrPriorityFeedback);
      const feedback = await feedbackRepository.findOneBy({ pr_number: pullNumber });


      if (commentText?.includes('CONFIRM')) {
        logger.info(`Feedback confirmed for PR #${pullNumber}`);
        const priority_confirmed = true;
       
        const actual_priority = feedback?.predicted_priority;
        if (feedback) {
          await feedbackRepository.update(feedback.id, { priority_confirmed, actual_priority });
          logger.info(`Updated feedback for PR #${pullNumber}: confirmed priority`);
          feedbackReceived = true;
          feedbackType = 'confirmed';
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
          feedbackReceived = true;
          feedbackType = 'actual_priority';
        } else {
          logger.warn(`No feedback found for PR #${pullNumber}`);
        }
      }
    }
    if (feedbackReceived) {
      let thankYouMessage = '';
      
      if (feedbackType === 'confirmed') {
        thankYouMessage = `✅ Thank you for confirming the priority assessment for this PR! Your feedback helps improve our prioritization system. 📊`;
      } else {
        thankYouMessage = `🔄 Thank you for providing feedback on the priority of this PR! Your input helps improve our prioritization system. 📈`;
      }
      
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: thankYouMessage
      });
      
      logger.info(`Added thank you comment for PR #${pullNumber}`);
    }

    /**
 * Process PR priority feedback data in batches for RL model training
 * Tracks which records have been processed to avoid duplicate processing
 * 
 * @param batchSize Number of records to process in each batch (default: 50)
 * @param maxBatches Maximum number of batches to process (optional)
 * @returns Summary of the batch processing operation
 */
export async function processPriorityFeedbackBatches(
  batchSize: number = 50,
  maxBatches?: number
): Promise<{ 
  processedBatches: number, 
  totalRecords: number, 
  success: boolean 
}> {
  try {
    logger.info(`Starting batch processing of PR priority feedback with batch size: ${batchSize}`);
    
    const feedbackRepository = AppDataSource.getRepository(PrPriorityFeedback);
    
    // Get total count of unprocessed records - use raw SQL to check for unprocessed records
    const totalRecordsResult = await feedbackRepository.query(`
      SELECT COUNT(*) FROM pr_priority_feedback 
      WHERE priority_confirmed = true 
      AND (processed_by_rl IS NULL OR processed_by_rl = false)
    `);
    
    const totalRecords = parseInt(totalRecordsResult[0].count, 10);
    
    logger.info(`Found ${totalRecords} unprocessed confirmed priority feedback records`);
    
    if (totalRecords === 0) {
      logger.info('No new confirmed priority feedback records to process');
      return { processedBatches: 0, totalRecords: 0, success: true };
    }
    
    // Calculate how many batches we need
    const requiredBatches = Math.ceil(totalRecords / batchSize);
    const batchesToProcess = maxBatches ? Math.min(requiredBatches, maxBatches) : requiredBatches;
    
    logger.info(`Will process ${batchesToProcess} batches`);
    
    let processedBatches = 0;
    let totalProcessedRecords = 0;
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    // Process each batch
    for (let i = 0; i < batchesToProcess; i++) {
      // Fetch batch of unprocessed records using raw SQL
      const records = await feedbackRepository.query(`
        SELECT * FROM pr_priority_feedback
        WHERE priority_confirmed = true
        AND (processed_by_rl IS NULL OR processed_by_rl = false)
        ORDER BY updated_at DESC
        LIMIT ${batchSize}
      `);
      
      if (records.length === 0) {
        logger.info(`No more records to process, stopping at batch ${i}`);
        break;
      }
      
      logger.info(`Processing batch ${i + 1} with ${records.length} records`);
      
      // Generate CSV file for this batch
      const batchFileName = `pr_priority_feedback_batch_${i + 1}_${Date.now()}.csv`;
      const filePath = path.join(tempDir, batchFileName);
      
      await generateCsvFile(records, filePath);
      
      // Send to RL model
      const modelResponse = await sendToRLModel(filePath);
      
      if (!modelResponse.success) {
        logger.error(`Failed to process batch ${i + 1} with RL model: ${modelResponse.message}`);
        // Continue with next batch even if this one failed
      } else {
        logger.info(`Successfully processed batch ${i + 1} with RL model`);
        
        // Mark these records as processed using raw SQL
        const recordIds = records.map(record => record.id).join(',');
        await feedbackRepository.query(`
          UPDATE pr_priority_feedback
          SET processed_by_rl = true, 
              rl_processed_at = NOW()
          WHERE id IN (${recordIds})
        `);
        
        logger.info(`Marked ${records.length} records as processed by RL model`);
        
        if (modelResponse.modelUpdated) {
          logger.info('RL model was updated based on feedback');
        }
        
        totalProcessedRecords += records.length;
      }
      
      processedBatches++;
      
      // Clean up the temporary file
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        logger.warn(`Failed to delete temporary file ${filePath}:`, error);
      }
    }
    
    logger.info(`Completed batch processing. Processed ${processedBatches} batches with ${totalProcessedRecords} records`);
    
    return {
      processedBatches,
      totalRecords: totalProcessedRecords,
      success: true
    };
  } catch (error) {
    logger.error('Error processing PR priority feedback batches:', error);
    return {
      processedBatches: 0,
      totalRecords: 0,
      success: false
    };
  }
}

/**
 * Generate CSV file from PR priority feedback records
 * 
 * @param records Array of PrPriorityFeedback records
 * @param filePath Path where CSV file should be saved
 * @returns Promise resolving to true if successful
 */
async function generateCsvFile(records: any[], filePath: string): Promise<boolean> {
  try {
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'pr_number', title: 'PR_NUMBER' },
        { id: 'predicted_priority', title: 'PREDICTED_PRIORITY' },
        { id: 'predicted_priority_score', title: 'PREDICTED_PRIORITY_SCORE' },
        { id: 'actual_priority', title: 'ACTUAL_PRIORITY' },
        { id: 'title', title: 'TITLE' },
        { id: 'owner', title: 'OWNER' },
        { id: 'body', title: 'BODY' },
        { id: 'comments', title: 'COMMENTS_COUNT' },
        { id: 'total_additions', title: 'TOTAL_ADDITIONS' },
        { id: 'total_deletions', title: 'TOTAL_DELETIONS' },
        { id: 'changed_files_count', title: 'CHANGED_FILES_COUNT' },
        { id: 'author_association', title: 'AUTHOR_ASSOCIATION' },
        { id: 'created_at', title: 'CREATED_AT' },
        { id: 'updated_at', title: 'UPDATED_AT' }
      ]
    });
    
    // Format dates and clean up data for CSV
    const formattedRecords = records.map(record => ({
      ...record,
      created_at: record.created_at ? new Date(record.created_at).toISOString() : null,
      updated_at: record.updated_at ? new Date(record.updated_at).toISOString() : null,
      // Ensure body text doesn't break CSV format
      body: record.body?.replace(/[\r\n,]/g, ' ').trim()
    }));
    
    await csvWriter.writeRecords(formattedRecords);
    logger.info(`Successfully generated CSV file: ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to generate CSV file:`, error);
    throw error;
  }
}

async function sendToRLModel(filePath: string): Promise<RLModelResponse> {
  try {
    logger.info(`Sending file ${filePath} to RL model`);
    
    const url = `${process.env.RL_MODEL_URL}/train`;
    
    // Read the file into a buffer
    const fileBuffer = await fs.promises.readFile(filePath);
    
    // Create form data with the file
    const formData = new FormData();
    
    // Create a Blob from the buffer and append it to FormData
    // Use the file's base name as the filename
    const fileName = path.basename(filePath);
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, fileName);
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
    }
    
    const result = await response.json();
    
    logger.info(`RL model response:`, result);
    
    return {
      success: true,
      message: result.message || 'Processing successful',
      modelUpdated: result.modelUpdated || false
    };
  } catch (error) {
    logger.error(`Failed to send file to RL model:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Schedule periodic batch processing of PR priority feedback
 * 
 * @param intervalMinutes Interval in minutes between each batch processing run
 * @param batchSize Number of records to process in each batch
 * @param maxBatchesPerRun Maximum batches to process in each scheduled run
 * @returns Function to stop the scheduled processing
 */
export function schedulePeriodicBatchProcessing(
  intervalMinutes: number = 60,
  batchSize: number = 50,
  maxBatchesPerRun: number = 10
): () => void {
  logger.info(`Scheduling periodic batch processing every ${intervalMinutes} minutes`);
  
  const intervalId = setInterval(async () => {
    logger.info(`Running scheduled batch processing`);
    
    const result = await processPriorityFeedbackBatches(batchSize, maxBatchesPerRun);
    
    if (result.success) {
      logger.info(`Scheduled run completed: processed ${result.totalRecords} records in ${result.processedBatches} batches`);
    }
  }, intervalMinutes * 60 * 1000);
  
  // Return function to stop scheduling
  return () => {
    clearInterval(intervalId);
    logger.info('Stopped scheduled batch processing');
  };
}

/**
 * Update PrPriorityFeedback table to add tracking fields
 * Run this once before using the batch processing functions
 */
export async function updatePrPriorityFeedbackSchema(): Promise<boolean> {
  try {
    logger.info('Adding processing tracking fields to PrPriorityFeedback table');
    
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
      // Check if columns exist
      const hasColumns = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'pr_priority_feedback' 
        AND column_name = 'processed_by_rl'
      `);
      
      if (hasColumns.length === 0) {
        // Add columns if they don't exist
        await queryRunner.query(`
          ALTER TABLE pr_priority_feedback 
          ADD COLUMN IF NOT EXISTS processed_by_rl BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS rl_processed_at TIMESTAMP WITH TIME ZONE
        `);
        logger.info('Successfully added tracking columns to PrPriorityFeedback table');
      } else {
        logger.info('Tracking columns already exist in PrPriorityFeedback table');
      }
    } finally {
      await queryRunner.release();
    }
    
    return true;
  }
  } catch (error) {
    logger.error(`Error processing feedback for PR #${pullNumber}:`, error);
  }
}
