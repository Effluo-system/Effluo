import { Entity, Column, ManyToOne, OneToMany, Relation } from 'typeorm';
import { Repo } from './repo.entity.ts';

@Entity()
export class Owner {
  @Column({ type: 'varchar', primary: true, nullable: false })
  id!: string;

  @Column({ type: 'varchar', nullable: false })
  login!: string;

  @Column({ type: 'varchar', nullable: false })
  url!: string;

  @OneToMany(() => Repo, (repo) => repo.owner, {
    cascade: true,
    nullable: true,
  })
  repos?: Relation<Repo[]>;
}
