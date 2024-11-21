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
}
