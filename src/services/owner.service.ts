import { Owner } from '../entities/owner.entity.ts';
import { AppDataSource } from '../server/server.ts';

export class OwnerService {
  private static ownerRepository = AppDataSource.getRepository(Owner);

  public static async createOwner(owner: Owner): Promise<Owner> {
    try {
      return this.ownerRepository.save(owner);
    } catch (error) {
      throw new Error(`Error adding owner to db: ${error}`);
    }
  }

  public static async getOwnersById(id: string): Promise<Owner | null> {
    try {
      return this.ownerRepository.findOne({
        where: {
          id,
        },
      });
    } catch (error) {
      throw new Error(`Error getting owner from db: ${error}`);
    }
  }

  public static async getAllOwners(): Promise<Owner[]> {
    try {
      return this.ownerRepository.find();
    } catch (error) {
      throw new Error(`Error getting owner from db: ${error}`);
    }
  }
}
