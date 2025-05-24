import { Octokit } from 'octokit';
import { Repo } from '../entities/repo.entity.ts';
import { AppDataSource } from '../server/server.ts';
import { logger } from '../utils/logger.ts';
import { OwnerService } from './owner.service.ts';
import { In } from 'typeorm';

export class RepoService {
  private static repoRepository = AppDataSource.getRepository(Repo);

  public static async createRepo(repo: Repo): Promise<Repo> {
    try {
      return this.repoRepository.save(repo);
    } catch (error) {
      throw new Error(`Error adding repo to db: ${error}`);
    }
  }

  public static async getRepoById(id: string): Promise<Repo | null> {
    try {
      return this.repoRepository.findOne({
        where: {
          id,
        },
        relations: ['owner'],
      });
    } catch (error) {
      throw new Error(`Error getting repo from db: ${error}`);
    }
  }

  public static async getRepoByOwnerAndName(
    owner: string,
    name: string
  ): Promise<Repo | null> {
    try {
      return this.repoRepository.findOne({
        where: {
          full_name: name,
          owner: {
            login: owner,
          },
        },
        relations: ['owner'],
      });
    } catch (error) {
      throw new Error(`Error getting repo ${owner}/${name} from db: ${error}`);
    }
  }

  public static async getAllRepo(): Promise<Repo[]> {
    try {
      return this.repoRepository.find();
    } catch (error) {
      throw new Error(`Error getting repos from db: ${error}`);
    }
  }

  public static async getReposByOwnerId(ownerId: string): Promise<Repo[]> {
    try {
      return this.repoRepository.find({
        where: {
          owner: {
            id: ownerId,
          },
        },
      });
    } catch (error) {
      throw new Error(`Error getting repos from db: ${error}`);
    }
  }

  public static async getReposByToken(token: string) {
    try {
      const octokit = new Octokit({
        auth: token,
      });
      const { data } = await octokit.rest.users.getAuthenticated();
      if (!data?.login) {
        logger.error(`User is unauthorized to view repos`);
        throw new Error('unauthorized');
      }
      const accessibleRepos = await this.getAccessibleRepos(octokit);
      if (accessibleRepos.length === 0) {
        return [];
      }

      const repos = await this.repoRepository.find({
        where: {
          id: In(accessibleRepos.map((r) => r.id)),
        },
      });
      // if (!isOwner) {
      //   logger.error(`User is unauthorized to view repositories`);
      //   throw new Error('unauthorized');
      // } else {
      //   const repos = await RepoService.getReposByOwnerId(id.toString());
      //   return repos;
      // }
      return repos;
    } catch (error: any) {
      if (
        error?.status === 401 || // Octokit throws this
        error?.message?.includes('Bad credentials') // fallback match
      ) {
        logger.warn('GitHub token is invalid or unauthorized');
        throw new Error('unauthorized');
      }

      logger.error(error);
      throw new Error(`${error.message}`);
    }
  }

  public static async getAccessibleRepos(octokit: Octokit) {
    try {
      const userRepos = await octokit.paginate(
        octokit.rest.repos.listForAuthenticatedUser,
        {
          per_page: 100,
          sort: 'updated',
          direction: 'desc',
          affiliation:
            'owner,collaborator,organization_member,organization_owner',
        }
      );

      // Extract repository identifiers (owner/name combinations)
      const accessibleRepos = userRepos.map((repo) => ({
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        id: repo.id,
      }));

      if (accessibleRepos.length === 0) {
        return [];
      }

      return accessibleRepos;
    } catch (error) {
      logger.error((error as Error).message);
      if ((error as Error).message === 'unauthorized') {
        throw new Error('unauthorized');
      }
      throw new Error(`Error getting pull requests by token: ${error}`);
    }
  }
}
