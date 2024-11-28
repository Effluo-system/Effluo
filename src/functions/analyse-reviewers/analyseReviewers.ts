import schedule, { Spec } from 'node-schedule';
import { ReviewService } from '../../services/review.service.ts';
import { UserReviewSummary } from '../../types/analyze-reviewers';

export const analyzeReviewers = async () => {
  const reviews = await ReviewService.getReviewsMadeInTheCurrentWeek();
  //console.log(JSON.stringify(reviews));
  const repoData: UserReviewSummary = {};

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

  // Output the structured data
  console.log(JSON.stringify(repoData));
};

export const analyzeReviewersCron = (cron: String = '30 * * * * *') => {
  schedule.scheduleJob(cron as Spec, () => {
    analyzeReviewers();
  });
};
