import schedule, { Spec } from 'node-schedule';
import { ReviewService } from '../../services/review.service.ts';
import { UserReviewSummary } from '../../types/analyze-reviewers';

export const analyzeReviewers = async () => {
  const reviews = await ReviewService.getReviewsMadeInTheWeek();
  //console.log(JSON.stringify(reviews));
  const summary: UserReviewSummary = {};

  reviews.forEach((review) => {
    const userName = review.created_by_user_login;
    const labels = review.pull_request?.labels ?? [];

    labels.forEach((label) => {
      if (!summary[userName]) {
        summary[userName] = {};
      }
      if (!summary[userName][label]) {
        summary[userName][label] = 0;
      }
      summary[userName][label] += 1;
    });
  });

  console.log(summary);
};

export const analyzeReviewersCron = (cron: String = '30 * * * * *') => {
  schedule.scheduleJob(cron as Spec, () => {
    analyzeReviewers();
  });
};
