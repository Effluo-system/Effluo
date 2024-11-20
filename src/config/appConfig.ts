import { App as GitHubApp, Octokit } from 'octokit';
import { env } from './env.ts';

export const app = new GitHubApp({
  appId: env.appId,
  privateKey: env.privateKey,
  webhooks: {
    secret: env.secret,
  },
  ...(env.enterpriseHostname && {
    Octokit: Octokit.defaults({
      baseUrl: `https://${env.enterpriseHostname}/api/v3`,
    }),
  }),
});
