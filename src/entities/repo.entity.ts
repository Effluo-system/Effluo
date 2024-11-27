import { Entity, Column, ManyToOne, OneToOne } from 'typeorm';
import { Owner } from './owner.entity.ts';
import { UserReviewSummary } from './userReviewSummary.entity.ts';

@Entity()
export class Repo {
  @Column({ type: 'varchar', primary: true, nullable: false })
  id: number;

  @Column({ type: 'varchar', nullable: false })
  full_name: string;

  @Column({ type: 'varchar', nullable: false })
  url: string;

  @ManyToOne(() => Owner, (owner) => owner.repos, {
    cascade: false,
  })
  owner: Owner;

  @OneToOne(() => UserReviewSummary, (summary) => summary.repo, {
    cascade: true,
  })
  user_review_summary: UserReviewSummary;

  constructor(
    id: number,
    full_name: string,
    url: string,
    owner: Owner,
    user_review_summary: UserReviewSummary
  ) {
    this.id = id;
    this.full_name = full_name;
    this.url = url;
    this.owner = owner;
    this.user_review_summary = user_review_summary;
  }
}
