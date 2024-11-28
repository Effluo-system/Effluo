import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  Relation,
} from 'typeorm';
import { UserReviewSummary as Summary } from '../types/analyze-reviewers.ts';
import { Repo } from './repo.entity.ts';

@Entity()
export class UserReviewSummary {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'jsonb', nullable: false, default: {} })
  review_summary!: Summary;

  @OneToOne(() => Repo, (repo) => repo.user_review_summary, {
    cascade: false,
  })
  repo!: Relation<Repo>;
}
