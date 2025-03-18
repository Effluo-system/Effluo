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
import {
  createWorkflowFileFromTemplate,
  pushWorkflowFilesToGithub,
} from './pipelines/createAssignReviewerPipeline.ts';
import { PRReviewRequestService } from '../../services/prReviewRequest.service.ts';
import { IssueService } from '../../services/issue.service.ts';

export const analyzeReviewers = async () => {
  try {
    logger.info('Initializing reviewer analysis algorithm');
    const reviews = await ReviewService.getReviewsMadeInTheCurrentWeek();
    const repoData: UserReviewSummary = {};

    logger.debug('Creating summary ...');

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
        repoData[repoId][user][label] = repoData[repoId][user][label] + 1;
      });
    });
    logger.debug('Summary created');
    // const metrics = findMostWorkedInCategory(repoData);
    const ranks = rankDevelopersByCategory(repoData);
    const mostSuitable = await findMostSuitableDev(ranks);
    await fetchSummaryForEachRepo(mostSuitable);
    logger.debug('Metrics calculated successfully');
    logger.info('Reviewer analysis completed successfully');
    return { Success: true };
  } catch (err) {
    logger.error(err);
    return { Success: false, Error: err };
  }
};

export const analyzeReviewersCron = (cron: String = '0 0 * * *') => {
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
  logger.debug('Finding most frequent reviewers for each label...');
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

export const fetchSummaryForEachRepo = async (
  newSummary: FrequencySummaryResult
) => {
  logger.debug('Fetching previous summary for each repo ...');
  Object.keys(newSummary).forEach(async (repoId) => {
    const previousSummary = await UserReviewSummaryService.getSummaryByRepoId(
      repoId
    );
    const repo = await RepoService.getRepoById(repoId);
    if (!repo) {
      throw new Error(`Repo with id ${repoId} not found`);
    }
    if (!previousSummary) {
      await UserReviewSummaryService.createSummary({
        repo: repo,
        review_summary: newSummary[repoId],
      });
      // TODO: add pipeline
      logger.debug(`Summary for repo ${repoId} has been created`);
      logger.debug('Initiating pipeline creation...');
      const summary = newSummary[repoId];

      await pushWorkflowFilesToGithub(
        repo.owner.login,
        repo.full_name.split('/')[1],
        'main',
        summary
      );

      logger.debug('Pipeline created');
      return;
    } else if (
      areSummariesEqual(previousSummary.review_summary, newSummary[repoId])
    ) {
      logger.debug(
        `Summary for repo ${repoId} has not changed. Skipping pipeline creation`
      );
      return;
    } else {
      previousSummary.review_summary = newSummary[repoId];
      await UserReviewSummaryService.updateSummary(previousSummary);
      logger.debug(`Summary for repo ${repoId} has been updated`);
      await pushWorkflowFilesToGithub(
        repo.owner.login,
        repo.full_name.split('/')[1],
        'main',
        newSummary[repoId]
      );

      logger.debug('Pipeline created');
      return;
    }
  });
};

export function areSummariesEqual(
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

// Function to rank developers within each category
export const rankDevelopersByCategory = (data: UserReviewSummary) => {
  const rankedData: Record<
    string,
    Record<string, { user: string; count: number }[]>
  > = {};

  for (const repoId in data) {
    const repoContributions = data[repoId];
    const categoryMap: Record<string, { user: string; count: number }[]> = {};

    for (const user in repoContributions) {
      for (const category in repoContributions[user]) {
        const count = repoContributions[user][category];

        if (!categoryMap[category]) {
          categoryMap[category] = [];
        }

        categoryMap[category].push({ user, count });
      }
    }

    // Sort each category's developers by count in descending order
    for (const category in categoryMap) {
      categoryMap[category].sort((a, b) => b.count - a.count);
    }

    rankedData[repoId] = categoryMap;
  }

  return rankedData;
};

export const findMostSuitableDev = async (
  ranks: Record<string, Record<string, { user: string; count: number }[]>>
) => {
  const result: Record<string, Record<string, string>> = {}; // Final output object

  for (const repoId of Object.keys(ranks)) {
    const categoryWise = ranks[repoId];
    result[repoId] = {}; // Initialize repo object

    for (const category of Object.keys(categoryWise)) {
      const userRankings = categoryWise[category];

      for (const user of userRankings) {
        const currentReviewRequests =
          await PRReviewRequestService.findByUserLoginAndRepoID(
            user.user,
            repoId
          );
        const currentIssues = await IssueService.findByUserLogin(user.user);

        const reviewRequestWorkload = currentReviewRequests?.reduce(
          (acc, request) =>
            acc + (typeof request.weight === 'number' ? request.weight : 0),
          0
        );

        const issueWorkload = currentIssues?.reduce(
          (acc, issue) =>
            acc + (typeof issue.weight === 'number' ? issue.weight : 0),
          0
        );

        const totalWorkload =
          (reviewRequestWorkload ?? 0) + (issueWorkload ?? 0);

        if (totalWorkload < 500) {
          result[repoId][category] = user.user; // Assign the user
          break; // Stop searching for this category
        }
      }
    }
  }

  return result;
};
