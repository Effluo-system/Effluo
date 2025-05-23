import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.ts';

export interface BuildData {
  id: string;
  repositoryName: string;
  owner: string;
  workflowName: string;
  status: 'completed' | 'requested' | 'in_progress';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
  runNumber: number;
  createdAt: Date;
  updatedAt: Date;
  url: string;
  associatedPRs?: {
    number: number;
    title: string;
    url: string;
  }[];
}

export class BuildService {
  /**
   * Get builds by authentication token
   * 
   * @param token GitHub authentication token
   * @returns Array of build data for repositories accessible with the token
   */
  public static async getBuildsByToken(token: string): Promise<BuildData[]> {
    try {
      logger.info('Getting builds by token');
      // Create Octokit instance directly with token
      const octokit = new Octokit({
        auth: token
      });
      
      // Get user repositories
      const { data: repos } = await octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        direction: 'desc',
        per_page: 100
      });
      
      const allBuilds: BuildData[] = [];
      
      // For each repo, get workflow runs
      for (const repo of repos) {
        try {
          const { data: runs } = await octokit.actions.listWorkflowRunsForRepo({
            owner: repo.owner.login,
            repo: repo.name,
            per_page: 10 // Limit to recent builds
          });
          
          // Process each workflow run
          for (const run of runs.workflow_runs) {
            const buildData = await BuildService.extractBuildData(
              octokit,
              repo.owner.login,
              repo.name,
              run.id
            );
            
            if (buildData) {
              allBuilds.push(buildData);
            }
          }
        } catch (error) {
          logger.warn(`Failed to get workflow runs for ${repo.full_name}:`, error);
          // Continue to next repo
        }
      }
      
      return allBuilds;
    } catch (error) {
      logger.error('Failed to get builds by token:', error);
      if (error instanceof Error && error.message.includes('Bad credentials')) {
        throw new Error('unauthorized');
      }
      throw error;
    }
  }
 /**
   * Extract associated pull requests for a workflow run
   * 
   * @param octokit Octokit instance
   * @param owner Repository owner
   * @param repo Repository name
   * @param runId Workflow run ID
   * @returns Array of associated PR data
   */
  private static async getAssociatedPRs(
    octokit: Octokit, 
    owner: string, 
    repo: string, 
    runId: number
  ) {
    try {
      // Get the workflow run details
      const { data: run } = await octokit.rest.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId
      });
      
      const associatedPRs: {number: number; title: string; url: string}[] = [];
      
      // Method 1: Check if the run was triggered by a PR event
      if (run.event === 'pull_request') {
        logger.info(`Run #${runId} was triggered by a pull_request event`);
        
        // For pull_request events, the head SHA can help us identify the PR
        if (run.head_sha) {
          // Try to find the PR number from the head SHA
          try {
            // Search for PRs with this head SHA
            const { data: searchResults } = await octokit.rest.search.issuesAndPullRequests({
              q: `repo:${owner}/${repo} is:pr ${run.head_sha}`
            });
            
            for (const item of searchResults.items) {
              if (item.pull_request) {
                associatedPRs.push({
                  number: item.number,
                  title: item.title,
                  url: item.html_url
                });
              }
            }
          } catch (searchError) {
            logger.warn(`Failed to search for PRs with head SHA:`, searchError);
          }
        }
      }
      
      // Method 2: If Method 1 didn't find anything, check by matching head repo and SHA
      if (associatedPRs.length === 0 && run.head_repository && run.head_sha) {
        // Get open PRs in the repository
        const { data: pullRequests } = await octokit.rest.pulls.list({
          owner,
          repo,
          state: 'open',
          sort: 'updated',
          direction: 'desc'
        });
        
        // Find PRs that match the head repository and SHA
        const matchingPRs = pullRequests.filter(pr => 
          pr.head.repo?.full_name === run.head_repository?.full_name && 
          pr.head.sha === run.head_sha
        );
        
        for (const pr of matchingPRs) {
          associatedPRs.push({
            number: pr.number,
            title: pr.title,
            url: pr.html_url
          });
        }
        
        // If we didn't find any, try looking for closed PRs that might have been merged
        if (associatedPRs.length === 0) {
          const { data: closedPRs } = await octokit.rest.pulls.list({
            owner,
            repo,
            state: 'closed',
            sort: 'updated',
            direction: 'desc',
            per_page: 20 // Limit to recent PRs
          });
          
          // Check if any closed PRs match our criteria
          const closedMatchingPRs = closedPRs.filter(pr => 
            pr.head.repo?.full_name === run.head_repository?.full_name && 
            pr.head.sha === run.head_sha
          );
          
          for (const pr of closedMatchingPRs) {
            associatedPRs.push({
              number: pr.number,
              title: pr.title,
              url: pr.html_url
            });
          }
        }
      }
      
      // Method 3: Check if the workflow was triggered by a check_suite event on a PR
      if (associatedPRs.length === 0 && run.event === 'check_suite' && run.head_sha) {
        try {
          // Get check suites for this SHA
          const { data: checkSuites } = await octokit.rest.checks.listSuitesForRef({
            owner,
            repo,
            ref: run.head_sha
          });
          
          // Find check suites that match this run
          for (const suite of checkSuites.check_suites) {
            // If there's a PR associated with this check suite
            if (suite.pull_requests && suite.pull_requests.length > 0) {
              for (const prRef of suite.pull_requests) {
                try {
                  // Get PR details
                  const { data: pr } = await octokit.rest.pulls.get({
                    owner,
                    repo,
                    pull_number: prRef.number
                  });
                  
                  associatedPRs.push({
                    number: pr.number,
                    title: pr.title,
                    url: pr.html_url
                  });
                } catch (prError) {
                  logger.warn(`Failed to get PR #${prRef.number}:`, prError);
                }
              }
            }
          }
        } catch (checkError) {
          logger.warn(`Failed to get check suites:`, checkError);
        }
      }
      
      // Method 4: Look for PR references in commit messages (if all else fails)
      if (associatedPRs.length === 0 && run.head_sha) {
        try {
          // Get the commit associated with the workflow run
          const { data: commit } = await octokit.rest.repos.getCommit({
            owner,
            repo,
            ref: run.head_sha
          });
          
          // Look for PR references in commit message like "Merge pull request #123"
          const commitMessage = commit.commit.message;
          const prRefs = commitMessage.match(/PR #(\d+)|pull request #(\d+)|#(\d+)/gi);
          
          if (prRefs) {
            // Extract PR numbers
            const prNumbers = new Set<number>();
            for (const ref of prRefs) {
              const match = ref.match(/#(\d+)/);
              if (match) {
                prNumbers.add(parseInt(match[1], 10));
              }
            }
            
            // Get details for each PR found
            for (const prNumber of prNumbers) {
              try {
                const { data: pr } = await octokit.rest.pulls.get({
                  owner,
                  repo,
                  pull_number: prNumber
                });
                
                associatedPRs.push({
                  number: pr.number,
                  title: pr.title,
                  url: pr.html_url
                });
              } catch (prError) {
                // If we get a 404, this might not be a valid PR number
                // if (prError.status !== 404) {
                  logger.warn(`Failed to get PR #${prNumber}:`);
                // }
              }
            }
          }
        } catch (commitError) {
          logger.warn(`Failed to analyze commit message:`, commitError);
        }
      }
      
      // De-duplicate PRs by number
      const uniquePRs = Array.from(
        associatedPRs.reduce((map, pr) => {
          if (!map.has(pr.number)) {
            map.set(pr.number, pr);
          }
          return map;
        }, new Map<number, {number: number; title: string; url: string}>())
      ).map(([_, pr]) => pr);
      
      return uniquePRs;
    } catch (error) {
      logger.error(`Failed to get PRs for run #${runId}:`, error);
      return [];
    }
  }
  
  

  /**
   * Extract comprehensive build data from GitHub Actions
   *
   * @param octokit Octokit instance
   * @param owner Repository owner
   * @param repo Repository name
   * @param runId Specific workflow run ID
   * @returns Processed build data
   */
  public static async extractBuildData(
    octokit: Octokit,
    owner: string,
    repo: string,
    runId: number
  ): Promise<BuildData | undefined> {
    try {
      logger.info(`Extracting build data for run #${runId} in ${owner}/${repo}`);
      // Fetch workflow run details
      const { data: run } = await octokit.rest.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId
      });

      // Get associated pull requests
      const associatedPRs = await BuildService.getAssociatedPRs(
        octokit,
        owner,
        repo,
        runId
      );

      if (associatedPRs.length > 0) {
        logger.info(`Found ${associatedPRs.length} associated PR(s) for run #${runId}`);
      }else {
        logger.info(`No associated PRs found for run #${runId}`);
      }

      return {
        id: run.id.toString(),
        repositoryName: repo,
        owner: owner,
        workflowName: run.name || 'Unknown Workflow',
        status: run.status as BuildData['status'],
        conclusion: run.conclusion as BuildData['conclusion'],
        runNumber: run.run_number,
        createdAt: new Date(run.created_at),
        updatedAt: new Date(run.updated_at),
        url: run.html_url,
        associatedPRs: associatedPRs.length > 0 ? associatedPRs : undefined
      };
    } catch (error) {
      logger.error(`Failed to extract build data for run #${runId}:`, error);
      return undefined;
    }
  }

  /**
   * Check if a build has failed
   *
   * @param buildData Build data to check
   * @returns Boolean indicating if build failed
   */
  public static hasBuildFailed(buildData: BuildData): boolean {
    return buildData.conclusion === 'failure' || buildData.status === 'requested';
  }
}