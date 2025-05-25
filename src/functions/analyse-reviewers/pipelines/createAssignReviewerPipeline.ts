import { logger } from '../../../utils/logger.ts';
import { Octokit } from '@octokit/rest';
import { autoAssignReviewerWorkflow } from './Templates/autoAssignReviewer.ts';
import { createNewJWT } from '../../../utils/generateGithubJWT.ts';
import {
  CommittableFile,
  FrequencySummaryResultForEachRepo,
} from '../../../types/analyze-reviewers';

export async function createWorkflowFileFromTemplate(
  reviewers: string[],
  labels: string[]
): Promise<CommittableFile | undefined> {
  try {
    const filePath = `.github/workflows/auto-assign-reviewer-${labels
      .map((label) => label.replace(/ /g, '-'))
      .join('-')}-workflow.yml`; // Path to the workflow file

    // Define the content of the workflow file
    const workflowYaml = autoAssignReviewerWorkflow({
      reviewers: reviewers,
      label: labels,
    });

    return {
      path: filePath,
      mode: '100644',
      type: 'commit',
      content: workflowYaml,
    } as CommittableFile;
  } catch (error) {
    logger.error('Error creating workflow file template:', error);
    return undefined;
  }
}

export const pushWorkflowFilesToGithub = async (
  owner: string,
  repo: string,
  branch: string,
  summary: FrequencySummaryResultForEachRepo
) => {
  try {
    logger.info(
      `Starting workflow push for ${owner}/${repo} on branch ${branch}`
    );
    logger.info('Summary data:', summary);

    const jwt = createNewJWT();
    const octokit = new Octokit({
      auth: `Bearer ${jwt}`,
    });

    // Check if the file already exists
    const installations = await octokit.apps.listInstallations();
    logger.info(`Found ${installations.data.length} installations`);

    const tokenResponse = await octokit.apps.createInstallationAccessToken({
      installation_id: installations.data[0].id,
    });
    const token = tokenResponse.data.token;
    const octokitWithToken = new Octokit({
      auth: token,
    });

    const { data: refData } = await octokitWithToken.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const sha = refData.object.sha;
    logger.info(`Got reference SHA: ${sha}`);

    // Fix: Use Promise.all to wait for all async operations to complete
    const filePromises = Object.keys(summary).map(async (category) => {
      const reviewers = [summary[category]];
      logger.info(
        `Creating workflow for category: ${category}, reviewers:`,
        reviewers
      );
      return await createWorkflowFileFromTemplate(reviewers, [category]);
    });

    const committableFiles = await Promise.all(filePromises);
    logger.info(`Created ${committableFiles.length} workflow files`);

    // Filter out any undefined files
    const validFiles = committableFiles.filter(
      (file): file is CommittableFile => file !== undefined
    );
    logger.info(`Valid files after filtering: ${validFiles.length}`);

    // Log the valid files for debugging
    validFiles.forEach((file, index) => {
      logger.info(`File ${index + 1}: ${file.path}`);
    });

    // Check if we have any valid files to commit
    if (validFiles.length === 0) {
      throw new Error('No valid workflow files to commit');
    }

    logger.info('Creating tree...');
    const {
      data: { sha: currentTreeSHA },
    } = await octokitWithToken.git.createTree({
      owner: owner,
      repo: repo,
      tree: validFiles,
      base_tree: sha,
    });
    logger.info(`Created tree with SHA: ${currentTreeSHA}`);

    logger.info('Creating commit...');
    const {
      data: { sha: newCommitSHA },
    } = await octokitWithToken.git.createCommit({
      owner: owner,
      repo: repo,
      tree: currentTreeSHA,
      message: `Create new workflows for auto reviewer assignment`,
      parents: [sha],
    });
    logger.info(`Created commit with SHA: ${newCommitSHA}`);

    logger.info('Updating reference...');
    await octokitWithToken.git.updateRef({
      owner: owner,
      repo: repo,
      sha: newCommitSHA,
      ref: `heads/${branch}`,
    });

    logger.info('Workflows pushed successfully');
  } catch (error) {
    logger.error('Error in pushWorkflowFilesToGithub:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error,
    });
    throw new Error(
      `Failed to push workflows: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};
