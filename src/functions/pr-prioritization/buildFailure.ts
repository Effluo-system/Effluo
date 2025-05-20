import { Octokit } from '@octokit/rest';
import { BuildService, BuildData } from '../../services/build.service.ts';
import { logger } from '../../utils/logger.ts';
import { extractPullRequestData } from '../pr-prioritization/pr-prioritization.ts';

/**
 * Check for high-priority PRs in the repository
 * 
 * @param octokit Octokit instance
 * @param owner Repository owner
 * @param repo Repository name
 * @returns Array of high-priority PR numbers
 */
export async function findHighPriorityPRs(
  octokit: Octokit, 
  owner: string, 
  repo: string
): Promise<number[]> {
  try {
    // Get open pull requests
    const { data: pullRequests } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open'
    });

    const highPriorityPRs: number[] = [];

    // Check each PR for high priority
    for (const pr of pullRequests) {
      const prData = await extractPullRequestData(
        octokit, 
        owner, 
        repo, 
        pr.number
      );

      if (prData) {
        // You might need to adjust this logic based on your priority determination method
        const isPriority = prData.labels.some(label => 
          label.toLowerCase().includes('high-priority') || 
          label.toLowerCase().includes('critical')
        );

        if (isPriority) {
          highPriorityPRs.push(pr.number);
        }
      }
    }

    return highPriorityPRs;
  } catch (error) {
    logger.error('Error finding high-priority PRs:', error);
    return [];
  }
}

/**
 * Create a deployment delay comment for failed builds or high-priority PRs
 * 
 * @param octokit Octokit instance
 * @param buildData Build data
 * @param highPriorityPRs List of high-priority PR numbers
 */
export async function createDeploymentDelayComment(
  octokit: Octokit,
  buildData: BuildData,
  highPriorityPRs: number[]
): Promise<void> {
  try {
    let commentBody = '';

    if (BuildService.hasBuildFailed(buildData)) {
      commentBody += `🚨 **Build Failure Detected** 🚨\n\n`;
      commentBody += `The build #${buildData.runNumber} for workflow \`${buildData.workflowName}\` has failed.\n\n`;
    }

    if (highPriorityPRs.length > 0) {
      commentBody += `⚠️ **Deployment Delay Recommended** ⚠️\n\n`;
      commentBody += `High-priority Pull Requests that require attention:\n`;
      
      highPriorityPRs.forEach(prNumber => {
        commentBody += `- PR #${prNumber}\n`;
      });

      commentBody += `\n**Deployment Note:** Please review and address these high-priority PRs before proceeding with the deployment.`;
    }

    // Post comment to the repository
    await octokit.rest.issues.create({
      owner: buildData.owner,
      repo: buildData.repositoryName,
      title: 'Deployment Delay Recommendation',
      body: commentBody,
      labels: ['deployment-delay']
    });

    logger.info(`Created deployment delay comment for build #${buildData.runNumber}`);
  } catch (error) {
    logger.error('Error creating deployment delay comment:', error);
  }
}

/**
 * Main function to process build and check for delays
 * 
 * @param octokit Octokit instance
 * @param owner Repository owner
 * @param repo Repository name
 * @param runId Workflow run ID
 */
export async function processBuildAndCheckDelay(
  octokit: Octokit,
  owner: string,
  repo: string,
  runId: number
): Promise<void> {
  try {
    // Extract build data
    const buildData = await BuildService.extractBuildData(
      octokit, 
      owner, 
      repo, 
      runId
    );

    if (!buildData) {
      logger.error('Failed to extract build data');
      return;
    }

    // Find high-priority PRs
    const highPriorityPRs = await findHighPriorityPRs(
      octokit, 
      owner, 
      repo
    );

    // Determine if we need to create a deployment delay comment
    if (BuildService.hasBuildFailed(buildData) || highPriorityPRs.length > 0) {
      await createDeploymentDelayComment(
        octokit, 
        buildData, 
        highPriorityPRs
      );
    }
  } catch (error) {
    logger.error('Error processing build and checking for delays:', error);
  }
}