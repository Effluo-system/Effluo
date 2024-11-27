import { Entity, Column, PrimaryGeneratedColumn, OneToOne } from 'typeorm';
import { UserReviewSummary as Summary } from '../types/analyze-reviewers.ts';
import { Repo } from './repo.entity.ts';

@Entity()
export class UserReviewSummary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'jsonb', nullable: false, default: {} })
  review_summary: Summary;

  @OneToOne(() => Repo, (repo) => repo.user_review_summary, {
    cascade: false,
  })
  repo: Repo | null;

  constructor(id: number, review_summary: Summary) {
    this.id = id;
    this.review_summary = review_summary;
    this.repo = null;
  }
}
