import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  Relation,
} from 'typeorm';
import { Issue } from './issue.entity.ts';
import { MergeResolution } from './mergeResolution.entity.ts';
import { Owner } from './owner.entity.ts';
import { UserReviewSummary } from './userReviewSummary.entity.ts';

@Entity()
export class Repo {
  @Column({ type: 'varchar', primary: true, nullable: false })
  id!: string;

  @Column({ type: 'varchar', nullable: false })
  full_name!: string;

  @Column({ type: 'varchar', nullable: false })
  url!: string;

  @ManyToOne(() => Owner, (owner) => owner.repos, {
    onUpdate: 'CASCADE',
  })
  owner!: Owner;

  @OneToOne(() => UserReviewSummary, (summary) => summary.repo, {
    cascade: true,
    nullable: true,
  })
  user_review_summary!: Relation<UserReviewSummary> | null;

  @OneToMany(() => Issue, (issue) => issue.repo, {
    cascade: false,
  })
  issues!: Relation<Issue[]> | null;

  @OneToMany(() => MergeResolution, (mergeResolution) => mergeResolution.repo)
  mergeResolutions?: Relation<MergeResolution[]>;
}
