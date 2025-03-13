import { Octokit } from 'octokit';
import { MergeResolution } from '../entities/mergeResolution.entity.ts';
import { AppDataSource } from '../server/server.ts';
import { logger } from '../utils/logger.ts';

interface ResolutionData {
  filename: string;
  resolvedCode: string;
  baseContent?: string;
  oursContent?: string;
  theirsContent?: string;
  oursBranch?: string;
  theirsBranch?: string;
}

export class MergeConflictService {
  private static mergeResolutionRepository =
    AppDataSource.getRepository(MergeResolution);

  public static async saveMergeResolution(
    resolution: MergeResolution
  ): Promise<MergeResolution> {
    try {
      return this.mergeResolutionRepository.save(resolution);
    } catch (error) {
      throw new Error(`Error saving merge resolution to db: ${error}`);
    }
  }

  public static async getResolutionById(
    id: number
  ): Promise<MergeResolution | null> {
    try {
      return this.mergeResolutionRepository.findOne({
        where: { id },
        relations: ['repo'],
      });
    } catch (error) {
      throw new Error(`Error getting merge resolution from db: ${error}`);
    }
  }

  public static async getResolutionsByPullRequest(
    repoId: string,
    pullRequestNumber: number
  ): Promise<MergeResolution[]> {
    try {
      return this.mergeResolutionRepository.find({
        where: {
          repo: { id: repoId },
          pullRequestNumber,
        },
        relations: ['repo'],
      });
    } catch (error) {
      throw new Error(
        `Error getting merge resolutions for PR #${pullRequestNumber}: ${error}`
      );
    }
  }

  public static async confirmResolution(id: number): Promise<MergeResolution> {
    try {
      const resolution = await this.getResolutionById(id);
      if (!resolution) {
        throw new Error(`Resolution with ID ${id} not found`);
      }

      resolution.confirmed = true;
      return this.mergeResolutionRepository.save(resolution);
    } catch (error) {
      throw new Error(`Error confirming merge resolution: ${error}`);
    }
  }

  public static async applyResolution(
    id: number,
    token: string
  ): Promise<MergeResolution> {
    try {
      const resolution = await this.getResolutionById(id);
      if (!resolution) {
        throw new Error(`Resolution with ID ${id} not found`);
      }

      if (!resolution.confirmed) {
        throw new Error(`Resolution must be confirmed before applying`);
      }

      if (!resolution.repo) {
        throw new Error(`Resolution has no associated repository`);
      }

      const octokit = new Octokit({ auth: token });

      const { data: fileData } = await octokit.rest.repos.getContent({
        owner: resolution.repo.owner.login,
        repo: resolution.repo.full_name,
        path: resolution.filename,
        ref: resolution.oursBranch || undefined,
      });

      const { data: commitData } =
        await octokit.rest.repos.createOrUpdateFileContents({
          owner: resolution.repo.owner.login,
          repo: resolution.repo.full_name,
          path: resolution.filename,
          message: `Resolve merge conflict for ${resolution.filename}`,
          content: Buffer.from(resolution.resolvedCode).toString('base64'),
          sha: (fileData as any).sha,
          branch: resolution.oursBranch || undefined,
        });

      resolution.applied = true;
      resolution.appliedCommitSha = commitData.commit.sha;

      return this.mergeResolutionRepository.save(resolution);
    } catch (error) {
      throw new Error(`Error applying merge resolution: ${error}`);
    }
  }

  public static async storeResolutionsForPR(
    repoId: string,
    pullNumber: number,
    resolutions: ResolutionData[]
  ): Promise<void> {
    try {
      // Process each resolution
      for (const resolution of resolutions) {
        // Create a new merge resolution entity
        const mergeResolution = new MergeResolution();
        mergeResolution.repo = { id: repoId } as any; // Set reference to repo
        mergeResolution.pullRequestNumber = pullNumber;
        mergeResolution.filename = resolution.filename;
        mergeResolution.resolvedCode = resolution.resolvedCode;

        // Store the full content of each version
        if (resolution.baseContent) {
          mergeResolution.baseContent = resolution.baseContent;
        }

        if (resolution.oursContent) {
          mergeResolution.oursContent = resolution.oursContent;
        }

        if (resolution.theirsContent) {
          mergeResolution.theirsContent = resolution.theirsContent;
        }

        // Store branch names if available
        if (resolution.oursBranch) {
          mergeResolution.oursBranch = resolution.oursBranch;
        }

        if (resolution.theirsBranch) {
          mergeResolution.theirsBranch = resolution.theirsBranch;
        }

        // Save to database
        await this.mergeResolutionRepository.save(mergeResolution);
        logger.info(
          `Saved resolution for ${resolution.filename} in PR #${pullNumber}`
        );
      }
    } catch (error) {
      logger.error(`Failed to store merge conflict resolutions: ${error}`);
      throw error;
    }
  }

  public static async deleteResolution(id: number): Promise<void> {
    try {
      await this.mergeResolutionRepository.delete(id);
    } catch (error) {
      throw new Error(`Error deleting merge resolution: ${error}`);
    }
  }
}
