import { Octokit } from 'octokit';
import { PRReviewRequest } from '../entities/prReviewRequest.entity.ts';
import { AppDataSource } from '../server/server.ts';
import { OwnerService } from './owner.service.ts';
import { logger } from '../utils/logger.ts';
import { RepoService } from './repo.service.ts';
import { In } from 'typeorm';

export class PRReviewRequestService {
  private static reviewRequestRepository =
    AppDataSource.getRepository(PRReviewRequest);

  public static async createPRReviewRequest(
    reviewRequest: PRReviewRequest
  ): Promise<PRReviewRequest> {
    try {
      return this.reviewRequestRepository.save(reviewRequest);
    } catch (error) {
      throw new Error(`Error adding PR Review Request to db: ${error}`);
    }
  }

  public static async updatePRReviewRequest(
    PRReviewRequest: PRReviewRequest
  ): Promise<PRReviewRequest> {
    try {
      return this.reviewRequestRepository.save(PRReviewRequest);
    } catch (error) {
      throw new Error(`Error updating review request: ${error}`);
    }
  }

  public static async getPRReviewRequestById(
    id: string
  ): Promise<PRReviewRequest | null> {
    try {
      return this.reviewRequestRepository.findOne({
        where: {
          id,
        },
      });
    } catch (error) {
      throw new Error(`Error getting PR Review Request from db: ${error}`);
    }
  }

  public static async getAllPRReviewRequest(): Promise<PRReviewRequest[]> {
    try {
      return this.reviewRequestRepository.find();
    } catch (error) {
      throw new Error(`Error getting PR Review Request from db: ${error}`);
    }
  }

  public static async findByPRId(
    prId: string
  ): Promise<PRReviewRequest | null> {
    try {
      return this.reviewRequestRepository.findOne({
        where: {
          pr: {
            id: prId,
          },
        },
      });
    } catch (error) {
      throw new Error(`Error getting PR Review Request from db: ${error}`);
    }
  }

  public static async deleteRequest(
    request: PRReviewRequest
  ): Promise<PRReviewRequest> {
    try {
      return this.reviewRequestRepository.remove(request);
    } catch (error) {
      throw new Error(`Error getting PR Review Request from db: ${error}`);
    }
  }

  public static async findByUserLoginAndRepoID(login: string, repoID: string) {
    try {
      return this.reviewRequestRepository
        .createQueryBuilder('prReviewRequest')
        .innerJoinAndSelect('prReviewRequest.pr', 'pullRequest')
        .innerJoinAndSelect('pullRequest.repository', 'repo')
        .where('prReviewRequest.assignees @> :login', {
          login: JSON.stringify([login]),
        })
        .andWhere('repo.id = :repoID', { repoID })
        .getMany();
    } catch (error) {
      throw new Error(`Error getting PR Review Request from db: ${error}`);
    }
  }

  public static async getReviewRequestsByToken(token: string) {
    try {
      const octokit = new Octokit({
        auth: token,
      });
      const { data } = await octokit.rest.users.getAuthenticated();
      if (!data?.login) {
        logger.error(`Unauthorized`);
        throw new Error('unauthorized');
      }

      const accessibleRepos = await RepoService.getAccessibleRepos(octokit);
      const reviewRequests = await this.reviewRequestRepository.find({
        where: {
          pr: {
            repository: {
              id: In(accessibleRepos.map((repo) => repo.id)),
            },
          },
        },
      });
      return reviewRequests;
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
}
