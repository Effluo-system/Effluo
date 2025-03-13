import {
  DeleteEvent,
  IssuesAssignedEvent,
  IssuesOpenedEvent,
  IssuesReopenedEvent,
  IssuesUnassignedEvent,
} from '@octokit/webhooks-types';
import { Difficulty } from '../constants/common.constants.ts';
import { Issue } from '../entities/issue.entity.ts';
import { AppDataSource } from '../server/server.ts';
import { logger } from '../utils/logger.ts';
import { OwnerService } from './owner.service.ts';
import { RepoService } from './repo.service.ts';
import { DeleteResult } from 'typeorm';

export class IssueService {
  private static issueRepository = AppDataSource.getRepository(Issue);

  public static async createIssue(issue: Issue): Promise<Issue> {
    try {
      return this.issueRepository.save(issue);
    } catch (error) {
      throw new Error(`Error adding issue to db: ${error}`);
    }
  }

  public static async deleteIssue(issueId: string): Promise<DeleteResult> {
    try {
      const result = await this.issueRepository.delete({ id: issueId });
      if (result.affected === 0) {
        throw new Error(`No issue found with ID: ${issueId}`);
      }
      return result;
    } catch (error) {
      throw new Error(`Error deleting issue from db: ${error}`);
    }
  }

  public static async getIssueById(id: string): Promise<Issue | null> {
    try {
      return this.issueRepository.findOne({
        where: {
          id,
        },
      });
    } catch (error) {
      throw new Error(`Error getting issue from db: ${error}`);
    }
  }

  public static async getAllIssues(): Promise<Issue[]> {
    try {
      return this.issueRepository.find();
    } catch (error) {
      throw new Error(`Error getting issues from db: ${error}`);
    }
  }

  public static async calculateWeight(labels: string[]): Promise<number> {
    // Filter labels that start with any of the Difficulty prefixes
    const relatedLabels = labels.filter((label) =>
      Difficulty.some((prefix) => label.startsWith(prefix))
    );

    // Extract numbers from the labels and sum them
    const weight = relatedLabels.reduce((acc, label) => {
      // Find the part of the label after the first '-'
      const numberPart = label.split('-')[1];
      // Parse the number and add to the accumulator if valid
      const number = parseInt(numberPart, 10);
      return !isNaN(number) ? acc + number : acc;
    }, 0);

    return weight;
  }

  public static async initiateCreationFlow(
    payload: IssuesOpenedEvent | IssuesReopenedEvent
  ): Promise<Issue> {
    let repo = await RepoService.getRepoById(
      payload?.repository?.id?.toString()
    );
    if (!repo) {
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
        full_name: payload?.repository?.full_name,
        id: payload?.repository?.id.toString(),
        issues: null,
        owner: owner,
        url: payload?.repository?.url,
        user_review_summary: null,
      });
      logger.info('Repo created successfully');
    }
    const labels = payload?.issue?.labels?.map((label) => label.name);
    let weight = 0;
    if (labels && labels.length > 0) {
      weight = await IssueService.calculateWeight(labels);
    }
    return await IssueService.createIssue({
      assignee: payload?.issue?.assignee?.login || null,
      assignees: payload?.issue?.assignees?.map((assignee) => assignee.login),
      id: payload?.issue?.id?.toString(),
      labels: labels ?? [],
      weight: weight > 0 ? weight : 3,
      repo: repo,
    });
  }

  public static async updateAssignees(
    payload: IssuesAssignedEvent | IssuesUnassignedEvent
  ) {
    try {
      const issue = await this.getIssueById(payload?.issue?.id?.toString());
      if (!issue) {
        logger.error(`Issue not found `);
        return;
      }
      issue.assignee = payload?.issue?.assignee?.login || null;
      issue.assignees = payload?.issue?.assignees?.map(
        (assignee) => assignee.login
      );
      return await this.issueRepository.save(issue);
    } catch (err) {
      logger.error(
        'Error updating assignees for the issue ' +
          payload?.issue?.id?.toString()
      );
    }
  }
}
