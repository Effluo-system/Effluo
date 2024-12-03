import { App as GitHubApp, Octokit } from 'octokit';
import { env } from './env.ts';
import { jwtToken } from '../utils/generateGithubJWT.ts';

export const app = new GitHubApp({
  auth: `Bearer ${jwtToken}`,
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
