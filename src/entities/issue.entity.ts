import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  Relation,
  OneToOne,
} from 'typeorm';
import { Repo } from './repo.entity.ts';

@Entity()
export class Issue {
  @Column({ type: 'varchar', primary: true, nullable: false })
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  assignee!: string | null;

  @Column({ nullable: true, type: 'jsonb', default: [] })
  assignees!: string[] | null;

  @Column({ nullable: true, type: 'jsonb', default: [] })
  labels!: string[] | null;

  @Column({ nullable: false, type: 'int', default: 0 })
  weight!: number;

  @OneToOne(() => Repo, (repo) => repo.owner, {
    cascade: true,
    nullable: true,
  })
  repo?: Relation<Repo>;
}
