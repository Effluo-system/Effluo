import { createNodeMiddleware, Webhooks } from '@octokit/webhooks';
import { app } from '../config/appConfig.ts';
import { PATH } from '../constants/common.constants.ts';

export const middleware = createNodeMiddleware(
  app.webhooks as unknown as Webhooks,
  {
    path: PATH,
  }
);
