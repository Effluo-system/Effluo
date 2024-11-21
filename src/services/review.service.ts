import { Review } from '../entities/review.entity.ts';
import { AppDataSource } from '../server/server.ts';

export class ReviewService {
  private static reviewRepository = AppDataSource.getRepository(Review);

  public static async createReview(review: Review): Promise<Review> {
    try {
      return this.reviewRepository.save(review);
    } catch (error) {
      throw new Error(`Error adding pull request to db: ${error}`);
    }
  }

  public static async getReviewById(id: number): Promise<Review | null> {
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
}
