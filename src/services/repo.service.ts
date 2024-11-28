import { Repo } from '../entities/repo.entity.ts';
import { AppDataSource } from '../server/server.ts';

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
      });
    } catch (error) {
      throw new Error(`Error getting repo from db: ${error}`);
    }
  }

  public static async getAllRepo(): Promise<Repo[]> {
    try {
      return this.repoRepository.find();
    } catch (error) {
      throw new Error(`Error getting repos from db: ${error}`);
    }
  }
}
