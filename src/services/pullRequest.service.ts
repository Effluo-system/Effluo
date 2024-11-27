import { PullRequest } from '../entities/pullRequest.entity.ts';
import { AppDataSource } from '../server/server.ts';

export class PullRequestService {
  private static pullRequestRepository =
    AppDataSource.getRepository(PullRequest);

  public static async createPullRequest(
    pullRequest: PullRequest
  ): Promise<PullRequest> {
    try {
      return this.pullRequestRepository.save(pullRequest);
    } catch (error) {
      throw new Error(`Error adding pull request to db: ${error}`);
    }
  }

  public static async getPullRequestById(
    id: number
  ): Promise<PullRequest | null> {
    try {
      return this.pullRequestRepository.findOne({
        where: {
          id,
        },
      });
    } catch (error) {
      throw new Error(`Error getting pull request from db: ${error}`);
    }
  }

  public static async getAllPullRequests(): Promise<PullRequest[]> {
    try {
      return this.pullRequestRepository.find();
    } catch (error) {
      throw new Error(`Error getting pull requests from db: ${error}`);
    }
  }
}
