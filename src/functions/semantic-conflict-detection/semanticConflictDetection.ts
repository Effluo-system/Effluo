import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

        // Type guard to ensure we have a file
        if (!('content' in response.data) || response.data.type !== 'file') {
            return null;
        }

        // Explicitly type the response and decode
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

        // Fetch content from both base and head branches
        const baseContent = await fetchFileContent(octokit, owner, repo, filename, baseBranch);
        const headContent = await fetchFileContent(octokit, owner, repo, filename, headBranch);

        // Analyze dependencies in the base content
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

export async function analyzeConflicts(files: {
  filename: string;
  baseContent: string;
  headContent: string;
  referencedFiles: { path: string; content: string }[];
}[]): Promise<string> {
    const prompt = `
You are an expert at detecting semantic conflicts in code. Analyze the following changes and their dependencies. Highlight any potential issues:

${files
    .map(
        (file) => `
File: ${file.filename}
Base Branch Content:
${file.baseContent}

Head Branch Content:
${file.headContent}

Referenced Files:
${file.referencedFiles
    .map(
        (ref) => `
Path: ${ref.path}
Content:
${ref.content}
`
    )
    .join('\n')}
`
    )
    .join('\n\n')}

Return clear and actionable conflict details.
    `;

    // Call Groq for chat-based completion
    const response = await groq.chat.completions.create({
        model: 'llama3-8b-8192',
        messages: [
            { role: 'system', content: 'You are a semantic conflict detector.' },
            { role: 'user', content: prompt },
        ],
    });

    return response.choices[0]?.message?.content || "No semantic conflicts detected.";
}