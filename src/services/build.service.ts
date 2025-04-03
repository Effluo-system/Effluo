import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.ts';

export interface BuildData {
  id: string;
  repositoryName: string;
  owner: string;
  workflowName: string;
  status: 'success' | 'failure' | 'pending' | 'cancelled';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
  runNumber: number;
  createdAt: Date;
  updatedAt: Date;
  url: string;
}

export class BuildService {
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
        url: run.html_url
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
    return buildData.conclusion === 'failure' || buildData.status === 'failure';
  }
}