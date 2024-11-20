import './events/pullRequest.ts';
import './events/push.ts';
import './events/onError.ts';
import './server/server.ts';
import { app } from './config/appConfig.ts';

const { data } = await app.octokit.request('/app');
app.octokit.log.debug(`Authenticated as '${data.name}'`);








