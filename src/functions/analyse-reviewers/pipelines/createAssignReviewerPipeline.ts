import * as fs from 'fs';
import { app } from '../../../config/appConfig.ts';

// Initialize Octokit with your personal access token

export async function createOrUpdateWorkflowFile() {
  const owner = 'Navojith'; // Replace with your GitHub username
  const repo = 'Effluo-Playground'; // Replace with your repository name
  const filePath = '.github/workflows/example-workflow.yml'; // Path to the workflow file
  const branch = 'main'; // Branch name to push the file to

  // Define the content of the workflow file
  const workflowYaml = `
name: Example Workflow

on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v2

    - name: Run a simple script
      run: echo "Hello, World!"
  `;

  try {
    // Check if the file already exists
    const { data: refData } = await app.octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const sha = refData.object.sha;

    // Create or update the workflow file
    const { data: fileData } =
      await app.octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: 'Add GitHub Actions workflow file',
        content: Buffer.from(workflowYaml).toString('base64'), // Base64 encode the file content
        branch: branch,
        sha: sha, // Set SHA if updating the file
      });

    console.log('Workflow YAML file created/updated:', fileData.content);
  } catch (error) {
    console.error('Error creating or updating the workflow file:', error);
  }
}
