import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { Repo } from './repo.entity.ts';

@Entity()
export class MergeResolution {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Repo, (repo) => repo.mergeResolutions, {
    nullable: false,
  })
  repo!: Relation<Repo>;

  @Column({ type: 'integer', nullable: false })
  pullRequestNumber!: number;

  @Column({ type: 'varchar', nullable: false })
  filename!: string;

  @Column({ type: 'text', nullable: false })
  resolvedCode!: string;

  @Column({ type: 'text', nullable: true })
  baseContent?: string;

  @Column({ type: 'text', nullable: true })
  oursContent?: string;

  @Column({ type: 'text', nullable: true })
  theirsContent?: string;

  @Column({ type: 'varchar', nullable: true })
  oursBranch?: string;

  @Column({ type: 'varchar', nullable: true })
  theirsBranch?: string;

  @Column({ type: 'boolean', nullable: false, default: false })
  confirmed!: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  applied!: boolean;

  @Column({ type: 'varchar', nullable: true })
  appliedCommitSha?: string;
}
