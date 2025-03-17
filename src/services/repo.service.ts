import { Octokit } from 'octokit';
import { Repo } from '../entities/repo.entity.ts';
import { AppDataSource } from '../server/server.ts';
import { logger } from '../utils/logger.ts';
import { OwnerService } from './owner.service.ts';

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
      if (data) {
        const { id } = data;
        const isOwner = await OwnerService.getOwnersById(id.toString());
        if (!isOwner) {
          logger.error(`User is unauthorized to view repositories`);
          throw new Error('unauthorized');
        } else {
          const repos = await RepoService.getReposByOwnerId(id.toString());
          return repos;
        }
      }
    } catch (error) {
      logger.error((error as Error).message);
      if ((error as Error).message === 'unauthorized') {
        throw new Error('unauthorized');
      }
      throw new Error(`Error getting pull requests by token: ${error}`);
    }
  }
}
