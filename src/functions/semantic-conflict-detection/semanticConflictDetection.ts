import axios from 'axios';
import { PRDiffFile } from '../../types/common';
import { PrConflictAnalysisService } from '../../services/prConflictAnalysis.service.ts';
import { PrFeedback } from '../../entities/prFeedback.entity.ts';
import { AppDataSource } from '../../server/server.ts';
import { logger } from '../../utils/logger.ts';

// Type for GitHub content response--------------------------------------------------------------------------------------------------------
interface GitHubContentResponse {
  type: 'file';
  encoding: string;
  size: number;
  name: string;
  path: string;
  content: string;
  sha: string;
}

// Helper functions for fetching and analyzing file content-------------------------------------------------------------------------------
export async function fetchFileContent(
  octokit: any,
  owner: string,
  repo: string,
  filePath: string,
  branch: string
): Promise<string | null> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });

    if (!("content" in response.data) || response.data.type !== "file") {
      return null;
    }

    return Buffer.from(response.data.content, "base64").toString("utf8");
  } catch (error) {
    console.error(`Skipping ${filePath} on branch ${branch} (File not found).`);
    return null;
  }
}

export function getReferencedFiles(fileContent: string): string[] {
  const importRegex = /import\s+.*\s+from\s+['"](.*)['"]/g;

  const uncommentedImports = fileContent
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')  
    .match(importRegex);

  if (!uncommentedImports) {
    return [];
  }

  return uncommentedImports.map((importStatement) => {
    const match = importStatement.match(/from\s+['"](.*)['"]/);
    return match ? match[1] : '';
  });
}


export async function fetchReferencedFiles(
  octokit: any,
  owner: string,
  repo: string,
  filePaths: string[],
  branch: string
): Promise<{ path: string; content: string }[]> {
  const files = await Promise.all(
    filePaths.map(async (filePath) => {
      const content = await fetchFileContent(octokit, owner, repo, filePath, branch);
      return { path: filePath, content: content || '' };
    })
  );
  return files.filter((file) => file.content !== '');
}

// Functions for analyzing pull requests------------------------------------------------------------------------------------------
export async function analyzePullRequest(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number,
  baseBranch: string,
  headBranch: string
): Promise<PRDiffFile[]> {
  const changedFiles = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  });

  const analysisDetails = [];
  for (const file of changedFiles.data) {
    const { filename } = file;
    const baseContent = await fetchFileContent(octokit, owner, repo, filename, baseBranch);
    const headContent = await fetchFileContent(octokit, owner, repo, filename, headBranch);
    const dependencies = baseContent ? getReferencedFiles(baseContent) : [];
    const referencedFiles = await fetchReferencedFiles(octokit, owner, repo, dependencies, baseBranch);

    analysisDetails.push({
      filename,
      baseContent: baseContent || '<File not found>',
      headContent: headContent || '<File not found>',
      referencedFiles,
    });
  }
  return analysisDetails;
}

export async function analyzePullRequest2(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number,
  baseBranch: string,
  headBranch: string
): Promise<{
  filename: string;
  baseVersionContent: string;
  mainBranchContent: string;
  prBranchContent: string;
}[]> {
  const mergeBase = await getMergeBase(octokit, owner, repo, baseBranch, headBranch);

  const changedFiles = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  });

  const analysisDetails = [];
  for (const file of changedFiles.data) {
    const { filename, status } = file;

    const baseVersionContent = await fetchFileContent(octokit, owner, repo, filename, mergeBase);
    const mainBranchContent = await fetchFileContent(octokit, owner, repo, filename, baseBranch);
    const prBranchContent = await fetchFileContent(octokit, owner, repo, filename, headBranch);

    // Log the three types of code versions for debugging purposes
    console.log(`Logging code versions for file: ${filename}`);
    console.log("Base Version Content:\n", baseVersionContent);
    console.log("Main Branch Content:\n", mainBranchContent);
    console.log("PR Branch Content:\n", prBranchContent);

    if (status === "added" || status === "removed") {
      console.log(`Skipping ${filename} (${status}) - Not modified in both branches.`);
      continue;
    }

    if (!baseVersionContent || !prBranchContent || !mainBranchContent) {
      console.log(`Skipping ${filename} - File missing in one of the branches.`);
      continue;
    }

    analysisDetails.push({
      filename,
      baseVersionContent,
      mainBranchContent,
      prBranchContent,
    });
  }

  return analysisDetails;
}


async function getMergeBase(octokit: any, owner: string, repo: string, mainBranch: string, featureBranch: string): Promise<string> {
  try {
    const response = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: mainBranch,
      head: featureBranch,
    });

    return response.data.merge_base_commit.sha;
  } catch (error) {
    console.error(`Error fetching merge base for ${mainBranch} and ${featureBranch}:`, error);
    throw error;
  }
}

// Functions for conflict analysis and reporting--------------------------------------------------------------------------------------------
export async function analyzeConflicts(
  files: {
    filename: string;
    baseVersionContent: string;
    mainBranchContent: string;
    prBranchContent: string;
  }[]
): Promise<string> {
  if (files.length === 0) {
    console.log("No modified files found for conflict analysis.");
    return "### Semantic Conflict Analysis\n\nNo modified files found for conflict analysis.";
  }

  const results = [];
  let conflictDetected = false;

  for (const file of files) {
    console.log(`Analyzing file: ${file.filename}`);

    const prompt = `
You are an expert code reviewer analyzing semantic merge conflicts in a Git repository. Analyze the following changes for semantic merge conflicts.

Base Branch (Common Ancestor):
${file.baseVersionContent}

Feature Branch (Pull Request Code):
${file.prBranchContent}

Target Branch (Updated Main Branch):
${file.mainBranchContent}

Return a JSON object with:
{
"conflict": "yes" or "no",
"explanation": "a comprehensive description including the reason and relevant code snippets of the places where the semantic conflict occurs"
}

Do not format the response with triple backticks (\` \`\`\` \`) or add \`json\` tags.
Strictly adhere to all guidelines.
`;

    try {
      const response = await axios.post(
        "http://localhost:11434/api/generate",
        {
          model: "qwen",
          prompt: prompt,
          format: "json",
          stream: false,
          keep_alive: -1,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      if (!response.data || !response.data.response) {
        console.error(`AI API returned an empty response for file: ${file.filename}`);
        results.push({
          filename: file.filename,
          conflict: false,
          explanation: "Error: AI API returned an empty response."
        });
        continue;
      }
      console.log(response);
      let responseData;
      try {
        responseData = JSON.parse(response.data.response);
      } catch (jsonError) {
        console.error(`JSON parsing error for file ${file.filename}:`, jsonError);
        console.error("Raw AI response (before parsing error):", response.data.response);
        results.push({
          filename: file.filename,
          conflict: false,
          explanation: "Error: AI response was not valid JSON."
        });
        continue;
      }

      if (responseData.conflict === "yes") {
        conflictDetected = true;
        results.push({
          filename: file.filename,
          conflict: true,
          explanation: responseData.explanation
        });
      } else {
        results.push({
          filename: file.filename,
          conflict: false,
          explanation: "No conflicts detected in this file."
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error analyzing conflicts for file ${file.filename}:`, error);
      results.push({
        filename: file.filename,
        conflict: false,
        explanation: `Error: Failed to analyze file (${errorMessage})`
      });
    }
  }

  if (conflictDetected) {
    const conflictFiles = results
      .filter(result => result.conflict)
      .map(result => `\n## File: \`${result.filename}\`\n${result.explanation}`)
      .join('\n\n');

    return `### Semantic Conflict Analysis\n**Conflicts Detected in ${results.filter(r => r.conflict).length}/${files.length} files:**${conflictFiles}`;
  } else {
    return "### Semantic Conflict Analysis\n\nNo semantic conflicts detected across all modified files.";
  }
}

// Functions for handling conflict feedback and validation---------------------------------------------------------------------------------------------------
export async function postAIValidationForm(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number
) {
  const validationMessage = `
✅ **AI Conflict Detection Results** ✅
Our AI has analyzed this pull request and found potential **semantic conflicts**.

### _What should you do next?_
📌 Please review the AI's findings and provide feedback by commenting with:
- \`#Confirm\` → If you agree this is a conflict.
- \`#NotAConflict\` → If you believe there's no conflict _(please add a brief explanation)_.

✍️ _Tip: Reply with one of the above tags as a separate comment._
`;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: validationMessage,
  });

  await PrConflictAnalysisService.trackAnalysis(
    issueNumber,
    owner,
    repo,
    true, // conflicts detected
    true  // validation form posted
  );
}

export async function logConflictFeedback(
  prNumber: number,
  conflictConfirmed: boolean,
  explanation: string | null
) {
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
}

export async function handleConflictAnalysis(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number,
  conflictAnalysis: string
) {
  if (conflictAnalysis.includes("Conflicts Detected")) {
    await octokit.rest.issues.createComment({
      owner: owner,
      repo: repo,
      issue_number: prNumber,
      body: conflictAnalysis,
    });

    await postAIValidationForm(octokit, owner, repo, prNumber);
  } else {
    logger.info(`No semantic conflicts detected for PR #${prNumber}`);
    await PrConflictAnalysisService.trackAnalysis(
      prNumber,
      owner,
      repo,
      false, // no conflicts detected
      false  // no validation form posted
    );
  }
}