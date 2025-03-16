import { logger } from '../../../utils/logger.ts';
import { Octokit } from '@octokit/rest';
import { autoAssignReviewerWorkflow } from './Templates/autoAssignReviewer.ts';
import { jwtToken } from '../../../utils/generateGithubJWT.ts';
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
    const octokit = new Octokit({
      auth: `Bearer ${jwtToken}`,
    });
    // Check if the file already exists
    const installations = await octokit.apps.listInstallations();
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
    logger.info('Ref data:', refData);
    const sha = refData.object.sha;

    let committableFiles: CommittableFile[] = [];
    Object.keys(summary).forEach(async (category) => {
      const reviewers = [summary[category]];
      const file: CommittableFile | undefined =
        await createWorkflowFileFromTemplate(reviewers, [category]);
      committableFiles.push(file!);
    });
    const {
      data: { sha: currentTreeSHA },
    } = await octokitWithToken.git.createTree({
      owner: owner,
      repo: repo,
      tree: committableFiles,
      base_tree: sha,
      message: 'Create new workflows for auto reviewer assignment 1',
      parents: [sha],
    });

    const {
      data: { sha: newCommitSHA },
    } = await octokitWithToken.git.createCommit({
      owner: owner,
      repo: repo,
      tree: currentTreeSHA,
      message: `Create new workflows for auto reviewer assignment 2`,
      parents: [sha],
    });

    await octokitWithToken.git.updateRef({
      owner: owner,
      repo: repo,
      sha: newCommitSHA,
      ref: `heads/${branch}`,
    });
    logger.info('Workflows pushed successfully');
  } catch (error) {
    logger.error(error);
  }
};
