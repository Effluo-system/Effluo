import axios from 'axios'; // For making API calls
import { stream } from 'winston';
import { PRDiffFile } from '../../types/common';

// Type for GitHub content response
interface GitHubContentResponse {
  type: 'file';
  encoding: string;
  size: number;
  name: string;
  path: string;
  content: string;
  sha: string;
}

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
  const dependencyRegex = /import\s+.*\s+from\s+['"](.*)['"]/g;
  const matches: string[] = [];
  let match;
  while ((match = dependencyRegex.exec(fileContent)) !== null) {
    matches.push(match[1]);
  }
  return matches;
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
      const content = await fetchFileContent(
        octokit,
        owner,
        repo,
        filePath,
        branch
      );
      return { path: filePath, content: content || '' };
    })
  );
  return files.filter((file) => file.content !== '');
}

// Don't change this function. Pawara is also using it in his code
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
    // Don't change this function. Pawara is also using it in his code
    const baseContent = await fetchFileContent(
      octokit,
      owner,
      repo,
      filename,
      baseBranch
    );
    const headContent = await fetchFileContent(
      octokit,
      owner,
      repo,
      filename,
      headBranch
    );
    // Don't change this function. Pawara is also using it in his code
    const dependencies = baseContent ? getReferencedFiles(baseContent) : [];
    const referencedFiles = await fetchReferencedFiles(
      octokit,
      owner,
      repo,
      dependencies,
      baseBranch
    );

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
): Promise<
  {
    filename: string;
    baseVersionContent: string;
    mainBranchContent: string;
    prBranchContent: string;
  }[]
> {
  const changedFiles = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  });

  const analysisDetails = [];
  for (const file of changedFiles.data) {
    const { filename, status } = file;

    const baseVersionContent = await fetchFileContent(octokit, owner, repo, filename, baseBranch);
    const mainBranchContent = await fetchFileContent(octokit, owner, repo, filename, headBranch);
    const prBranchContent = await fetchFileContent(octokit, owner, repo, filename, headBranch);

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

/**
 * Fetches the merge base commit (common ancestor) between main and feature branches.
 */
async function getMergeBase(octokit: any, owner: string, repo: string, mainBranch: string, featureBranch: string): Promise<string> {
    try {
        const response = await octokit.rest.repos.compareCommits({
            owner,
            repo,
            base: mainBranch,
            head: featureBranch,
        });

        return response.data.merge_base_commit.sha; // Return the common ancestor commit SHA
    } catch (error) {
        console.error(`Error fetching merge base for ${mainBranch} and ${featureBranch}:`, error);
        throw error;
    }
}



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

  const prompt = files
  .map(
    (item) => `
Analyze the following changes for semantic merge conflicts.

Base Branch (Common Ancestor):
${item.baseVersionContent}

Feature Branch (Pull Request Code):
${item.prBranchContent}

Target Branch (Updated Main Branch):
${item.mainBranchContent}

Return a JSON object with:
{
"conflict": "yes" or "no",
"explanation": "brief reason with relevant code snippets"
}

Do not format the response with triple backticks (\` \`\`\` \`) or add \`json\` tags.
`
  )
  .join("\n\n");

  console.log("Generated Prompt:", prompt);

  try {
    // Send request to the AI API
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

    console.log("Raw AI Response:", response.data);

    if (!response.data || !response.data.response) {
      console.error("AI API returned an empty response.");
      return "### Semantic Conflict Analysis\n\nError: AI API returned an empty response.";
    }

    let responseData;
    try {
      responseData =
        typeof response.data.response === "string"
          ? JSON.parse(response.data.response)
          : response.data.response;
    } catch (jsonError) {
      console.error("JSON parsing error:", jsonError);
      console.error("Raw AI response (before parsing error):", response.data.response);
      return "### Semantic Conflict Analysis\n\nError: AI response was not valid JSON.";
    }

    return responseData.conflict === "yes"
      ? `### Semantic Conflict Analysis\n**Conflict Detected:** ${responseData.explanation}`
      : "### Semantic Conflict Analysis\n\nNo semantic conflicts detected.";
  } catch (error) {
    console.error("Error analyzing conflicts:", error);
    return "### Semantic Conflict Analysis\n\nError analyzing conflicts during merge review.";
  }
}
