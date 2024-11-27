import { Entity, Column, ManyToOne, OneToMany } from 'typeorm';
import { Repo } from './repo.entity.ts';

@Entity()
export class Owner {
  @Column({ type: 'varchar', primary: true, nullable: false })
  id: number;

  @Column({ type: 'varchar', nullable: false })
  login: string;

  @Column({ type: 'varchar', nullable: false })
  url: string;

  @OneToMany(() => Repo, (repo) => repo.owner, {
    cascade: true,
  })
  repos: Repo[];

  constructor(id: number, login: string, url: string, repos: Repo[]) {
    this.id = id;
    this.login = login;
    this.url = url;
    this.repos = repos;
  }
}
