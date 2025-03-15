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

  public static async getResolutionByPRAndFilename(
    repoId: string,
    pullRequestNumber: number,
    filename: string
  ): Promise<MergeResolution | null> {
    try {
      return this.mergeResolutionRepository.findOne({
        where: {
          repo: { id: repoId },
          pullRequestNumber,
          filename,
        },
        relations: ['repo'],
      });
    } catch (error) {
      throw new Error(
        `Error getting merge resolution for PR #${pullRequestNumber} and file ${filename}: ${error}`
      );
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

  public static async confirmResolutionByPRAndFilename(
    repoId: string,
    pullRequestNumber: number,
    filename: string
  ): Promise<MergeResolution | null> {
    try {
      const resolution = await this.getResolutionByPRAndFilename(
        repoId,
        pullRequestNumber,
        filename
      );

      if (!resolution) {
        logger.error(
          `Resolution not found for PR #${pullRequestNumber} and file ${filename}`
        );
        return null;
      }

      resolution.confirmed = true;
      return this.mergeResolutionRepository.save(resolution);
    } catch (error) {
      logger.error(`Error confirming resolution: ${error}`);
      return null;
    }
  }

  public static async markResolutionAsApplied(
    repoId: string,
    pullRequestNumber: number,
    filename: string,
    commitSha: string
  ): Promise<MergeResolution | null> {
    try {
      const resolution = await this.getResolutionByPRAndFilename(
        repoId,
        pullRequestNumber,
        filename
      );

      if (!resolution) {
        logger.error(
          `Resolution not found for PR #${pullRequestNumber} and file ${filename}`
        );
        return null;
      }

      resolution.applied = true;
      resolution.appliedCommitSha = commitSha;
      return this.mergeResolutionRepository.save(resolution);
    } catch (error) {
      logger.error(`Error marking resolution as applied: ${error}`);
      return null;
    }
  }

  public static async storeResolutionsForPR(
    repoId: string,
    pullNumber: number,
    resolutions: ResolutionData[]
  ): Promise<void> {
    try {
      for (const resolution of resolutions) {
        const mergeResolution = new MergeResolution();
        mergeResolution.repo = { id: repoId } as any;
        mergeResolution.pullRequestNumber = pullNumber;
        mergeResolution.filename = resolution.filename;
        mergeResolution.resolvedCode = resolution.resolvedCode;
        mergeResolution.confirmed = false;
        mergeResolution.applied = false;

        if (resolution.baseContent) {
          mergeResolution.baseContent = resolution.baseContent;
        }

        if (resolution.oursContent) {
          mergeResolution.oursContent = resolution.oursContent;
        }

        if (resolution.theirsContent) {
          mergeResolution.theirsContent = resolution.theirsContent;
        }

        if (resolution.oursBranch) {
          mergeResolution.oursBranch = resolution.oursBranch;
        }

        if (resolution.theirsBranch) {
          mergeResolution.theirsBranch = resolution.theirsBranch;
        }

        await this.mergeResolutionRepository.save(mergeResolution);
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
