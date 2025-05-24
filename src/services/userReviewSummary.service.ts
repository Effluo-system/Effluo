import { Octokit } from 'octokit';
import { UserReviewSummary } from '../entities/userReviewSummary.entity.ts';
import { AppDataSource } from '../server/server.ts';
import { OwnerService } from './owner.service.ts';
import { logger } from '../utils/logger.ts';
import { RepoService } from './repo.service.ts';
import { In } from 'typeorm';

export class UserReviewSummaryService {
  private static reviewSummaryRepository =
    AppDataSource.getRepository(UserReviewSummary);

  public static async createSummary(
    summary: UserReviewSummary
  ): Promise<UserReviewSummary> {
    try {
      return this.reviewSummaryRepository.save(summary);
    } catch (error) {
      throw new Error(`Error adding summary to db: ${error}`);
    }
  }

  public static async getSummaryById(
    id: number
  ): Promise<UserReviewSummary | null> {
    try {
      return this.reviewSummaryRepository.findOne({
        where: {
          id,
        },
      });
    } catch (error) {
      throw new Error(`Error getting summary from db: ${error}`);
    }
  }

  public static async updateSummary(
    summary: UserReviewSummary
  ): Promise<UserReviewSummary> {
    try {
      return this.reviewSummaryRepository.save(summary);
    } catch (error) {
      throw new Error(`Error updating summary: ${error}`);
    }
  }

  public static async getSummaryByRepoId(
    repoId: string
  ): Promise<UserReviewSummary | null> {
    try {
      return this.reviewSummaryRepository.findOne({
        where: {
          repo: { id: repoId },
        },
        relations: ['repo'],
      });
    } catch (error) {
      throw new Error(`Error getting summary from db: ${error}`);
    }
  }

  public static async getAllSummaries(): Promise<UserReviewSummary[]> {
    try {
      return this.reviewSummaryRepository.find();
    } catch (error) {
      throw new Error(`Error getting summaries from db: ${error}`);
    }
  }

  public static async getSummaryByToken(token: string) {
    try {
      const octokit = new Octokit({
        auth: token,
      });

      const { data } = await octokit.rest.users.getAuthenticated();
      if (!data?.login) {
        logger.error(`User is unauthorized to view summaries`);
        throw new Error('unauthorized');
      }

      const accessibleRepos = await RepoService.getAccessibleRepos(octokit);
      if (accessibleRepos.length === 0) {
        return [];
      }

      // Fetch summaries for repositories the user has access to
      const summaries = await this.reviewSummaryRepository.find({
        where: {
          repo: In(accessibleRepos.map((r) => r.id)),
        },
        relations: ['repo'],
      });

      return summaries;
    } catch (error) {
      logger.error((error as Error).message);
      if ((error as Error).message === 'unauthorized') {
        throw new Error('unauthorized');
      }
      throw new Error(`Error getting Summaries by token: ${error}`);
    }
  }
  public static async deleteById(id: number, token: string): Promise<void> {
    try {
      if (!id) {
        logger.error(`id must be defined`);
        throw new Error('id must be defined');
      }
      const octokit = new Octokit({
        auth: token,
      });
      const { data } = await octokit.rest.users.getAuthenticated();

      if (data) {
        const { login } = data;

        if (!login) {
          logger.error(`User is unauthorized to delete summaries`);
          throw new Error('unauthorized');
        } else {
          await this.reviewSummaryRepository.delete(id);
        }
      }
    } catch (error) {
      throw new Error(`Error deleting summary with id ${id}: ${error}`);
    }
  }

  public static async deleteManyByIds(
    ids: number[],
    token: string
  ): Promise<void> {
    try {
      if (!ids) {
        logger.error(`ids must be defined`);
        throw new Error('ids must be defined');
      }
      const octokit = new Octokit({
        auth: token,
      });
      const { data } = await octokit.rest.users.getAuthenticated();

      if (data) {
        const { login } = data;

        if (!login) {
          logger.error(`User is unauthorized to view summaries`);
          throw new Error('unauthorized');
        } else {
          await this.reviewSummaryRepository.delete(ids);
        }
      }
    } catch (error) {
      throw new Error(
        `Error deleting summaries with ids [${ids.join(', ')}]: ${error}`
      );
    }
  }
}
