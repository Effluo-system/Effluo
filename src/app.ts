import './events/pullRequest.ts';
import './events/push.ts';
import './events/onError.ts';
import './events/mergeConflict.ts';
import './events/reviewPR.ts';
import { startServer } from './server/server.ts';
import { app as octokitApp } from './config/appConfig.ts';
import { analyzeReviewersCron } from './functions/analyse-reviewers/analyseReviewers.ts';
import { app } from './server/server.ts';

const { data } = await octokitApp.octokit.request('/app');
octokitApp.octokit.log.debug(`Authenticated as '${data.name}'`);

await startServer();
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'App is running!' });
});

analyzeReviewersCron();
