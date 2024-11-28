import { UserReviewSummary } from '../entities/userReviewSummary.entity.ts';
import { AppDataSource } from '../server/server.ts';

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
}
