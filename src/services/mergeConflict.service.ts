import { MergeResolution } from '../entities/mergeResolution.entity.ts';
import { PullRequest } from '../entities/pullRequest.entity.ts';
import { AppDataSource } from '../server/server.ts';
import { ResolutionData } from '../types/mergeConflicts';
import { logger } from '../utils/logger.ts';

export class MergeConflictService {
  private static mergeResolutionRepository =
    AppDataSource.getRepository(MergeResolution);
  private static pullRequestRepository =
    AppDataSource.getRepository(PullRequest);

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
        relations: ['repo', 'pullRequest'],
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
      // We still support filtering by PR number for compatibility
      return this.mergeResolutionRepository.findOne({
        where: {
          repo: { id: repoId },
          pullRequest: { number: pullRequestNumber },
          filename,
        },
        relations: ['repo', 'pullRequest'],
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
          pullRequest: { number: pullRequestNumber },
        },
        relations: ['repo', 'pullRequest'],
      });
    } catch (error) {
      throw new Error(
        `Error getting merge resolutions for PR #${pullRequestNumber}: ${error}`
      );
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

  public static async markAllResolutionsAsNotApplied(
    repoId: string,
    pullRequestNumber: number
  ): Promise<number> {
    try {
      logger.info(
        `Marking all resolutions as not applied for PR #${pullRequestNumber}`
      );

      const resolutions = await this.getResolutionsByPullRequest(
        repoId,
        pullRequestNumber
      );

      const appliedResolutions = resolutions.filter(
        (resolution) => resolution.applied
      );

      if (appliedResolutions.length === 0) {
        logger.info(
          `No applied resolutions found for PR #${pullRequestNumber}`
        );
        return 0;
      }

      for (const resolution of appliedResolutions) {
        resolution.applied = false;
        resolution.appliedCommitSha = undefined;
        await this.saveMergeResolution(resolution);
        logger.info(
          `Marked resolution for ${resolution.filename} as not applied`
        );
      }

      logger.info(
        `Successfully marked ${appliedResolutions.length} resolutions as not applied for PR #${pullRequestNumber}`
      );
      return appliedResolutions.length;
    } catch (error) {
      logger.error(
        `Error marking resolutions as not applied for PR #${pullRequestNumber}: ${error}`
      );
      throw new Error(`Failed to mark resolutions as not applied: ${error}`);
    }
  }

  public static async storeResolutionsForPR(
    repoId: string,
    pullNumber: number,
    resolutions: ResolutionData[]
  ): Promise<void> {
    try {
      // First, find the PullRequest entity
      const pullRequest = await this.pullRequestRepository.findOne({
        where: {
          repository: { id: repoId },
          number: pullNumber,
        },
      });

      if (!pullRequest) {
        throw new Error(
          `Pull request #${pullNumber} not found for repo ${repoId}`
        );
      }

      for (const resolution of resolutions) {
        const mergeResolution = new MergeResolution();
        mergeResolution.repo = { id: repoId } as any;
        mergeResolution.pullRequest = pullRequest;
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

  public static async getLatestProcessedResolution(
    repoId: string,
    pullRequestNumber: number
  ): Promise<MergeResolution | null> {
    try {
      // Find the most recently processed resolution for this PR
      return this.mergeResolutionRepository.findOne({
        where: {
          repo: { id: repoId },
          pullRequest: { number: pullRequestNumber },
        },
        order: {
          lastProcessedTimestamp: 'DESC',
        },
        relations: ['repo', 'pullRequest'],
      });
    } catch (error) {
      logger.error(`Error getting latest processed resolution: ${error}`);
      return null;
    }
  }

  public static async updateLastProcessedTimestamp(
    repoId: string,
    pullRequestNumber: number,
    timestamp: string
  ): Promise<boolean> {
    try {
      logger.info(
        `Updating last processed timestamp for PR #${pullRequestNumber} to ${timestamp}`
      );

      // Update all resolutions for this PR with the new timestamp
      const resolutions = await this.getResolutionsByPullRequest(
        repoId,
        pullRequestNumber
      );

      if (resolutions.length === 0) {
        logger.info(`No resolutions found for PR #${pullRequestNumber}`);
        return false;
      }

      for (const resolution of resolutions) {
        resolution.lastProcessedTimestamp = timestamp;
        await this.saveMergeResolution(resolution);
      }

      logger.info(
        `Updated last processed timestamp for ${resolutions.length} resolutions`
      );
      return true;
    } catch (error) {
      logger.error(`Error updating last processed timestamp: ${error}`);
      return false;
    }
  }

  public static async createMergeResolution(
    repoId: string,
    pullRequest: PullRequest,
    filename: string,
    resolvedCode: string,
    baseContent?: string,
    oursContent?: string,
    theirsContent?: string,
    lastProcessedTimestamp?: string,
    oursBranch?: string,
    theirsBranch?: string,
    commentId?: number
  ): Promise<MergeResolution> {
    try {
      const newResolution = new MergeResolution();
      newResolution.repo = { id: repoId } as any;
      newResolution.pullRequest = pullRequest;
      newResolution.filename = filename;
      newResolution.resolvedCode = resolvedCode;
      newResolution.baseContent = baseContent;
      newResolution.oursContent = oursContent;
      newResolution.theirsContent = theirsContent;
      newResolution.confirmed = false;
      newResolution.applied = false;
      newResolution.lastProcessedTimestamp =
        lastProcessedTimestamp || new Date().toISOString();

      if (oursBranch) {
        newResolution.oursBranch = oursBranch;
      }

      if (theirsBranch) {
        newResolution.theirsBranch = theirsBranch;
      }

      if (commentId) {
        newResolution.commentId = commentId;
      }

      return await this.saveMergeResolution(newResolution);
    } catch (error) {
      logger.error(
        `Failed to create merge resolution for ${filename}: ${error}`
      );
      throw new Error(`Error creating merge resolution: ${error}`);
    }
  }

  public static async updateMergeResolution(
    existingResolution: MergeResolution,
    resolvedCode: string,
    baseContent?: string,
    oursContent?: string,
    theirsContent?: string,
    lastProcessedTimestamp?: string,
    oursBranch?: string,
    theirsBranch?: string,
    commentId?: number
  ): Promise<MergeResolution> {
    try {
      existingResolution.resolvedCode = resolvedCode;
      existingResolution.baseContent = baseContent;
      existingResolution.oursContent = oursContent;
      existingResolution.theirsContent = theirsContent;
      existingResolution.confirmed = false;
      existingResolution.applied = false;
      existingResolution.lastProcessedTimestamp =
        lastProcessedTimestamp || new Date().toISOString();

      if (oursBranch) {
        existingResolution.oursBranch = oursBranch;
      }

      if (theirsBranch) {
        existingResolution.theirsBranch = theirsBranch;
      }

      if (commentId && !existingResolution.commentId) {
        existingResolution.commentId = commentId;
      }

      return await this.saveMergeResolution(existingResolution);
    } catch (error) {
      logger.error(
        `Failed to update merge resolution for ${existingResolution.filename}: ${error}`
      );
      throw new Error(`Error updating merge resolution: ${error}`);
    }
  }
}
