import { Octokit } from 'octokit';
import { Review } from '../entities/review.entity.ts';
import { AppDataSource } from '../server/server.ts';
import { OwnerService } from './owner.service.ts';
import { logger } from '../utils/logger.ts';
import { In } from 'typeorm';
import { RepoService } from './repo.service.ts';

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
      // Get the current date in Sri Lankan timezone
      const currentDate = new Date();

      // Calculate start of week (Monday) in local time
      const dayOfWeek = currentDate.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Handle Sunday (0) case

      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() + daysToMonday);
      startOfWeek.setHours(0, 0, 0, 0);

      // Calculate end of week (Sunday) in local time
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Fetch reviews made in the current week using TypeORM
      // TypeORM will handle the timezone conversion when comparing with database timestamps
      return this.reviewRepository
        .createQueryBuilder('review')
        .leftJoinAndSelect('review.pull_request', 'pull_request')
        .leftJoinAndSelect('pull_request.repository', 'repository')
        .where('review.created_at >= :startOfWeek', {
          startOfWeek: startOfWeek,
        })
        .andWhere('review.created_at <= :endOfWeek', {
          endOfWeek: endOfWeek,
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
      const response = await octokit.rest.users.getAuthenticated();
      const { data } = response;

      // Log rate limit info
      console.log('🔥 API Rate Limit Info:', {
        remaining: response.headers['x-ratelimit-remaining'],
        used: response.headers['x-ratelimit-used'],
      });
      if (!data?.login) {
        logger.error(`User is unauthorized to view reviews`);
        throw new Error('unauthorized');
      }
      const accessibleRepos = await RepoService.getAccessibleRepos(octokit);

      const reviews = await this.reviewRepository.find({
        where: {
          pull_request: {
            repository: {
              id: In(accessibleRepos.map((repo) => repo.id)),
            },
          },
        },
      });
      return reviews;
    } catch (error: any) {
      if (
        error?.status === 401 || // Octokit throws this
        error?.message?.includes('Bad credentials') // fallback match
      ) {
        logger.warn('GitHub token is invalid or unauthorized');
        throw new Error('unauthorized');
      }

      logger.error(error);
      throw new Error(`${error.message}`);
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
