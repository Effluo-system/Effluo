import 'reflect-metadata';
import { app as octokitApp } from './config/appConfig.ts';
import './events/buildData.ts';
import './events/issue.ts';
import './events/issueComment.ts';
import './events/mergeConflict.ts';
import './events/onError.ts';
import './events/pullRequest.ts';
import './events/push.ts';
import './events/reviewPR.ts';
import authRouter from './routes/auth.routes.ts';
import consoleRouter from './routes/console.routes.ts';
import { checkAuthToken } from './server/middleware.ts';
import { app, startServer } from './server/server.ts';

const { data } = await octokitApp.octokit.request('/app');
octokitApp.octokit.log.debug(`Authenticated as '${data.name}'`);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'App is running!' });
});

app.use(authRouter);
app.use(checkAuthToken);
app.use(consoleRouter);

await startServer();

// analyzeReviewersCron();
