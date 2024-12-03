import schedule, { Spec } from 'node-schedule';
import { ReviewService } from '../../services/review.service.ts';
import {
  RepoData,
  FrequencySummaryResult,
  UserReviewSummary,
  FrequencySummaryResultForEachRepo,
} from '../../types/analyze-reviewers';
import { UserReviewSummaryService } from '../../services/userReviewSummary.service.ts';
import { logger } from '../../utils/logger.ts';
import { RepoService } from '../../services/repo.service.ts';
import { Octokit } from '@octokit/rest';
import { createOrUpdateWorkflowFile } from './pipelines/createAssignReviewerPipeline.ts';

export const analyzeReviewers = async () => {
  const reviews = await ReviewService.getReviewsMadeInTheCurrentWeek();
  const repoData: UserReviewSummary = {};

  logger.info('Creating summary ...');

  // Populate the data structure
  reviews.forEach((review) => {
    const repoId = review.pull_request.repository.id;
    const user = review.created_by_user_login;
    const labels = review.pull_request?.labels || [];

    // Initialize repository if not already present
    if (!repoData[repoId]) {
      repoData[repoId] = {};
    }

    // Initialize user if not already present under this repository
    if (!repoData[repoId][user]) {
      repoData[repoId][user] = {};
    }

    // Count labels for the user within this repository
    labels.forEach((label) => {
      if (!repoData[repoId][user][label]) {
        repoData[repoId][user][label] = 0;
      }
      repoData[repoId][user][label]++;
    });
  });
  logger.info('Summary created');
  const metrics = findMostWorkedInCategory(repoData);
  await fetchSummaryForEachRepo(metrics);
  logger.info('Metrics calculated successfully');
};

export const analyzeReviewersCron = (cron: String = '30 * * * * *') => {
  schedule.scheduleJob(cron as Spec, () => {
    try {
      analyzeReviewers();
    } catch (err) {
      logger.error('Error occurred while analyzing reviewers', err);
    }
  });
};

function findMostWorkedInCategory(
  repos: UserReviewSummary
): FrequencySummaryResult {
  logger.info('Finding most frequent reviewers for each label...');
  return Object.keys(repos).reduce(
    (result: FrequencySummaryResult, repoId: string) => {
      const repo = repos[repoId];

      // Initialize the result object for the current repo
      result[repoId] = Object.keys(repo).reduce(
        (repoResult: { [category: string]: string }, person: string) => {
          const work = repo[person];

          // Iterate through the categories and update the person who worked most in each category
          Object.keys(work).forEach((category: string) => {
            const workCount = work[category];

            // If no one has been assigned to this category or the current person worked more, update the result
            if (
              !repoResult[category] ||
              workCount >
                ((repoResult[category] &&
                  repo[repoResult[category]][category]) ||
                  0)
            ) {
              repoResult[category] = person;
            }
          });

          return repoResult;
        },
        {}
      );

      return result;
    },
    {} as FrequencySummaryResult
  );
}

const repos: RepoData = {
  '213231': {
    David: { security: 2 },
    Fiona: { frontend: 6, security: 1, backend: 4 },
    Navojith: { frontend: 3, ui: 6 },
    Bob: { frontend: 1 },
  },
  '894052335': {
    Navojith: {
      backend: 2,
      security: 1,
      bug: 1,
      documentation: 1,
      duplicate: 1,
    },
  },
};

const fetchSummaryForEachRepo = async (newSummary: FrequencySummaryResult) => {
  logger.info('Fetching previous summary for each repo ...');

  Object.keys(newSummary).forEach(async (repoId) => {
    const previousSummary = await UserReviewSummaryService.getSummaryByRepoId(
      repoId
    );
    if (!previousSummary) {
      const repo = await RepoService.getRepoById(repoId);
      if (!repo) {
        throw new Error(`Repo with id ${repoId} not found`);
      }
      await UserReviewSummaryService.createSummary({
        repo: repo,
        review_summary: newSummary[repoId],
      });
      // TODO: add pipeline
      logger.info(`Summary for repo ${repoId} has been created`);
      logger.info('Initiating pipeline creation...');
      const summary = newSummary[repoId];
      Object.keys(summary).forEach(async (category) => {
        const reviewers = [summary[category]];
        await createOrUpdateWorkflowFile(
          repo.owner.login,
          repo.full_name.split('/')[1],
          reviewers,
          [category]
        );
      });
      logger.info('Pipeline created');
      return;
    }
    if (areSummariesEqual(previousSummary.review_summary, newSummary[repoId])) {
      logger.info(
        `Summary for repo ${repoId} has not changed. Skipping pipeline creation`
      );
      return;
    }
    previousSummary.review_summary = newSummary[repoId];
    await UserReviewSummaryService.updateSummary(previousSummary);
    logger.info(`Summary for repo ${repoId} has been updated`);
    logger.info('Initiating pipeline creation...');
  });
};

function areSummariesEqual(
  oldSummary: FrequencySummaryResultForEachRepo,
  newSummary: FrequencySummaryResultForEachRepo
): boolean {
  const oldKeys = Object.keys(oldSummary);
  const newKeys = Object.keys(newSummary);

  // Check if both have the same keys
  if (oldKeys.length !== newKeys.length) {
    return false;
  }

  for (const key of oldKeys) {
    if (!newSummary.hasOwnProperty(key)) {
      return false; // Key is missing in newSummary
    }
    if (oldSummary[key] !== newSummary[key]) {
      return false; // Value mismatch
    }
  }

  return true;
}
