import { Octokit } from 'octokit';
import { UserReviewSummary } from '../entities/userReviewSummary.entity.ts';
import { AppDataSource } from '../server/server.ts';
import { OwnerService } from './owner.service.ts';
import { logger } from '../utils/logger.ts';

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
      if (data) {
        const { id } = data;
        const isOwner = await OwnerService.getOwnersById(id.toString());
        if (!isOwner) {
          logger.error(`User is unauthorized to view summaries`);
          throw new Error('unauthorized');
        } else {
          console.log(isOwner.id);
          const summaries = await this.reviewSummaryRepository.find({
            where: {
              repo: {
                owner: {
                  id: isOwner?.id,
                },
              },
            },
            relations: ['repo'],
          });
          return summaries;
        }
      }
    } catch (error) {
      logger.error((error as Error).message);
      if ((error as Error).message === 'unauthorized') {
        throw new Error('unauthorized');
      }
      throw new Error(`Error getting Summaries by token: ${error}`);
    }
  }
}
