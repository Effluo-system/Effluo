import { PullRequest } from '../entities/pullRequest.entity.ts';
import { AppDataSource } from '../server/server.ts';
import type {
  PullRequestLabeledEvent,
  PullRequestOpenedEvent,
  PullRequestReopenedEvent,
  PullRequestReviewSubmittedEvent,
} from '@octokit/webhooks-types/schema.d.ts';
import { logger } from '../utils/logger.ts';
import { OwnerService } from './owner.service.ts';
import { RepoService } from './repo.service.ts';
import { Octokit } from 'octokit';
import { In } from 'typeorm';
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
    id: string
  ): Promise<PullRequest | null> {
    try {
      return this.pullRequestRepository.findOne({
        where: {
          id,
        },
      });
    } catch (error) {
      logger.error(error);
      throw new Error(`Error getting pull request from db: ${error}`);
    }
  }

  public static async getAllPullRequests(): Promise<PullRequest[]> {
    try {
      return this.pullRequestRepository.find();
    } catch (error) {
      logger.error(error);

      throw new Error(`Error getting pull requests from db: ${error}`);
    }
  }

  public static async updatePullRequest(
    pullRequest: PullRequest
  ): Promise<PullRequest> {
    try {
      return this.pullRequestRepository.save(pullRequest);
    } catch (error) {
      logger.error(error);

      throw new Error(`Error updating pull request: ${error}`);
    }
  }

  public static async initiatePullRequestCreationFlow(
    payload:
      | PullRequestOpenedEvent
      | PullRequestReopenedEvent
      | PullRequestReviewSubmittedEvent
      | PullRequestLabeledEvent
  ): Promise<PullRequest> {
    try {
      let repo = await RepoService.getRepoById(
        payload?.repository?.id.toString()
      );

      if (!repo) {
        logger.info('Repo not found, creating new repo ...');
        let owner = await OwnerService.getOwnersById(
          payload?.repository?.owner?.id.toString()
        );
        if (!owner) {
          logger.info('Owner not found, creating new owner ...');
          owner = await OwnerService.createOwner({
            id: payload?.repository?.owner?.id.toString(),
            login: payload?.repository?.owner?.login,
            url: payload?.repository?.owner?.html_url,
            repos: [],
          });
          logger.info('Owner created successfully');
        }
        repo = await RepoService.createRepo({
          id: payload?.repository?.id.toString(),
          full_name: payload?.repository?.full_name,
          url: payload?.repository?.html_url,
          owner: owner,
          user_review_summary: null,
          issues: null,
        });
        logger.info('Repo created successfully');
      }
      const pr = await PullRequestService.createPullRequest({
        id: payload?.pull_request?.id.toString(),
        title: payload?.pull_request?.title,
        body: payload?.pull_request?.body,
        assignee: payload?.pull_request?.assignee?.login || null,
        assignees: payload?.pull_request?.assignees?.map(
          (assignee) => assignee.login
        ),
        created_at: new Date(payload?.pull_request?.created_at),
        closed_at: payload?.pull_request?.closed_at
          ? new Date(payload?.pull_request?.closed_at)
          : null,
        number: payload?.pull_request?.number,
        repository: repo,
        created_by_user_id: payload?.pull_request?.user?.id,
        created_by_user_login: payload?.pull_request?.user?.login,
        url: payload?.pull_request?.html_url,
        reviews: [],
        labels: payload?.pull_request?.labels?.map((label) => label.name),
      });
      logger.info('Pull request created successfully');
      return pr;
    } catch (error) {
      logger.error(error);
      throw new Error(`Error initiating pull request creation flow: ${error}`);
    }
  }

  public static async getPullRequestsByToken(token: string) {
    try {
      const octokit = new Octokit({
        auth: token,
      });
      const { data } = await octokit.rest.users.getAuthenticated();

      if (data) {
        const { id } = data;
        const isOwner = await OwnerService.getOwnersById(id.toString());
        if (!isOwner) {
          const prs = await this.pullRequestRepository.find({
            where: {
              created_by_user_id: id,
            },
            relations: ['repository'],
          });
          return prs;
        } else {
          const repos = await RepoService.getReposByOwnerId(id.toString());

          const repoIds = repos.map((repo) => repo.id);
          const prs = await this.pullRequestRepository.find({
            where: {
              repository: { id: In(repoIds) },
            },
            relations: ['repository'],
          });
          return prs;
        }
      }
    } catch (error) {
      logger.error(error);
      throw new Error(`Error getting pull requests by token: ${error}`);
    }
  }
}
