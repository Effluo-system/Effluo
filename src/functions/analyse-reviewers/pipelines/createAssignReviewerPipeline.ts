import * as fs from 'fs';
import { app } from '../../../config/appConfig.ts';
import { OctokitOutgoing } from '../../../config/OctokitOutgoing.ts';
import { logger } from '../../../utils/logger.ts';
import { Octokit } from '@octokit/rest';
import { autoAssignReviewerWorkflow } from './Templates/autoAssignReviewer.ts';
import { jwtToken } from '../../../utils/generateGithubJWT.ts';

// Initialize Octokit with your personal access token

export async function createOrUpdateWorkflowFile(
  owner: string,
  repo: string,
  reviewers: string[],
  labels: string[]
) {
  const filePath = `.github/workflows/auto-assign-reviewer-${labels
    .map((label) => label.replace(/ /g, '-'))
    .join('-')}-workflow.yml`; // Path to the workflow file
  const branch = 'main'; // Branch name to push the file to

  // Define the content of the workflow file
  const workflowYaml = autoAssignReviewerWorkflow({
    reviewers: reviewers,
    label: labels,
  });

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

    // Create or update the workflow file
    const { data: fileData } =
      await octokitWithToken.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: 'Add GitHub Actions workflow file',
        content: Buffer.from(workflowYaml).toString('base64'), // Base64 encode the file content
        branch: branch,
        sha: sha, // Set SHA if updating the file
      });

    // console.log('Workflow YAML file created/updated:', fileData.content);
  } catch (error) {
    console.error('Error creating or updating the workflow file:', error);
  }
}
