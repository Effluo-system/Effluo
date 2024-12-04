import axios from 'axios'; // For making API calls
import { stream } from 'winston';

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

    if (!('content' in response.data) || response.data.type !== 'file') {
      return null;
    }

    const fileContent = response.data as GitHubContentResponse;
    return Buffer.from(fileContent.content, 'base64').toString('utf8');
  } catch (error) {
    console.error(`Error fetching content for ${filePath} on branch ${branch}:`, error);
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
      const content = await fetchFileContent(octokit, owner, repo, filePath, branch);
      return { path: filePath, content: content || '' };
    })
  );
  return files.filter((file) => file.content !== '');
}

export async function analyzePullRequest(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number,
  baseBranch: string,
  headBranch: string
): Promise<{
  filename: string;
  baseContent: string;
  headContent: string;
  referencedFiles: { path: string; content: string }[];
}[]> {
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

export async function analyzeConflicts(
  files: {
    filename: string;
    baseContent: string;
    headContent: string;
    referencedFiles: { path: string; content: string }[];
  }[]
): Promise<string> {
  const prompt = `
You are an expert semantic code conflict detector. Analyze the following files for potential conflicts.

Respond in the EXACT JSON format:
{
  "label": "conflict" or "no_conflict",
  "conflict_type": "structural conflicts" | "logic and behavior conflicts" | "integration conflicts" | "no conflicts",
  "explanation": "Detailed description of the conflict or why no conflict exists"
}

Files to analyze:
${files
    .map(
      (file) => `File: ${file.filename}
Base Branch Content:
${file.baseContent}

Head Branch Content:
${file.headContent}

Referenced Files:
${file.referencedFiles
    .map(
      (ref) => `Path: ${ref.path}
Content:
${ref.content}`
    )
    .join('\n')}
`
    )
    .join('\n\n')}
  `;

  try {
    // Send the request to the Ollama API
    const response = await axios.post(
      'http://localhost:11434/api/generate',
      {
        model: 'l1b', // Your fine-tuned model name
        prompt: prompt,
        format: 'json',
        stream: false,
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    // Parse the response
    const responseData = typeof response.data.response === 'string' 
      ? JSON.parse(response.data.response) 
      : response.data.response;

    // Return conflict type and explanation if conflict exists, otherwise return no conflicts message
    return responseData.label === 'conflict'
      ? `### Semantic Conflict Analysis

**${responseData.conflict_type}:** ${responseData.explanation}`
      : '### Semantic Conflict Analysis\n\nNo semantic conflicts detected.';

  } catch (error) {
    console.error('Error analyzing conflicts:', error);
    return '### Semantic Conflict Analysis\n\nError analyzing conflicts during merge review.';
  }
}