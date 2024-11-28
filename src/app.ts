import './events/pullRequest.ts';
import './events/push.ts';
import './events/onError.ts';
import './events/mergeConflict.ts';
import './events/reviewPR.ts';
import { startServer } from './server/server.ts';
import { app } from './config/appConfig.ts';
import { analyzeReviewersCron } from './functions/analyse-reviewers/analyseReviewers.ts';
import { ReviewService } from './services/review.service.ts';
import { PullRequestService } from './services/pullRequest.service.ts';

const { data } = await app.octokit.request('/app');
app.octokit.log.debug(`Authenticated as '${data.name}'`);

await startServer();

analyzeReviewersCron();
