import { Octokit } from '@octokit/rest';
import { jwtToken } from '../utils/generateGithubJWT.ts';

export class OctokitOutgoing {
  private static instance: Octokit | null = null;

  private constructor() {}

  public static getInstance(): Octokit {
    if (!OctokitOutgoing.instance) {
      OctokitOutgoing.instance = new Octokit({
        auth: `Bearer ${jwtToken}`,
      });
    }
    return OctokitOutgoing.instance;
  }
}
