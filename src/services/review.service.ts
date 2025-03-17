import { Octokit } from 'octokit';
import { Review } from '../entities/review.entity.ts';
import { AppDataSource } from '../server/server.ts';
import { OwnerService } from './owner.service.ts';
import { logger } from '../utils/logger.ts';

export class ReviewService {
  private static reviewRepository = AppDataSource.getRepository(Review);

  public static async createReview(review: Review): Promise<Review> {
    try {
      return this.reviewRepository.save(review);
    } catch (error) {
      throw new Error(`Error adding pull request to db: ${error}`);
    }
  }

  public static async getReviewById(id: string): Promise<Review | null> {
    try {
      return this.reviewRepository.findOne({
        where: {
          id,
        },
      });
    } catch (error) {
      throw new Error(`Error getting review from db: ${error}`);
    }
  }

  public static async getAllReviews(): Promise<Review[]> {
    try {
      return this.reviewRepository.find();
    } catch (error) {
      throw new Error(`Error getting reviews from db: ${error}`);
    }
  }

  public static async getReviewsMadeInTheCurrentWeek(): Promise<Review[]> {
    try {
      // Get the current date
      const currentDate = new Date();

      // Get the start of the week (Monday at 00:00:00 UTC)
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + 1); // Set to Monday
      startOfWeek.setHours(0, 0, 0, 0); // Set time to midnight (00:00:00)

      // Convert startOfWeek to UTC
      const startOfWeekUtc = new Date(startOfWeek.toISOString());

      // Get the end of the week (Sunday at 23:59:59.999 UTC)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Set to Sunday
      endOfWeek.setHours(23, 59, 59, 999); // Set time to 23:59:59.999

      // Convert endOfWeek to UTC
      const endOfWeekUtc = new Date(endOfWeek.toISOString());
      // Fetch reviews made in the current week using TypeORM
      return this.reviewRepository
        .createQueryBuilder('review')
        .leftJoinAndSelect('review.pull_request', 'pull_request')
        .leftJoinAndSelect('pull_request.repository', 'repository')
        .where('review.created_at >= :startOfWeek', {
          startOfWeek: startOfWeekUtc,
        })
        .andWhere('review.created_at <= :endOfWeek', {
          endOfWeek: endOfWeekUtc,
        })
        .getMany();
    } catch (error) {
      throw new Error(`Error getting latest reviews from db: ${error}`);
    }
  }

  public static async getReviewsByToken(token: string) {
    try {
      const octokit = new Octokit({
        auth: token,
      });
      const { data } = await octokit.rest.users.getAuthenticated();
      if (data) {
        const { login } = data;
        if (!login) {
          logger.error(`User is unauthorized to view reviews`);
          throw new Error('unauthorized');
        } else {
          const repos = await this.getReviewsByOwnerLogin(login);
          return repos;
        }
      }
    } catch (error) {
      logger.error((error as Error).message);
      if ((error as Error).message === 'unauthorized') {
        throw new Error('unauthorized');
      }
      throw new Error(`Error getting pull requests by token: ${error}`);
    }
  }

  public static async getReviewsByOwnerLogin(login: string) {
    try {
      return await this.reviewRepository.find({
        where: [
          {
            created_by_user_login: login,
          },
          {
            pull_request: {
              repository: {
                owner: {
                  login: login,
                },
              },
            },
          },
        ],
        relations: [
          'pull_request',
          'pull_request.repository',
          'pull_request.repository.owner',
        ],
      });
    } catch (error) {
      throw new Error(`Error getting reviews from db: ${error}`);
    }
  }
}
