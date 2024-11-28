import { Octokit } from '@octokit/rest';
import * as fs from 'fs';

// Initialize Octokit with your personal access token
const octokit = new Octokit({
  auth: 'YOUR_PERSONAL_ACCESS_TOKEN', // Replace with your GitHub token
});

async function createOrUpdateWorkflowFile() {
  const owner = 'your-github-username'; // Replace with your GitHub username
  const repo = 'your-repo-name'; // Replace with your repository name
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
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const sha = refData.object.sha;

    // Create or update the workflow file
    const { data: fileData } = await octokit.repos.createOrUpdateFileContents({
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

createOrUpdateWorkflowFile();
