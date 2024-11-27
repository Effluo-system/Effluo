import { Entity, Column, OneToMany } from 'typeorm';
import { Review } from './review.entity.ts';

@Entity()
export class PullRequest {
  @Column({ type: 'varchar', primary: true, nullable: false })
  id: number;

  @Column({ type: 'varchar', nullable: false })
  title: string;

  @Column({ type: 'varchar', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', nullable: true })
  assignee: string | null;

  @Column({ nullable: true, type: 'jsonb', default: [] })
  assignees: string[] | null;

  @Column({ type: 'varchar', nullable: false })
  created_at: Date;

  @Column({ type: 'varchar', nullable: true })
  closed_at: Date | null;

  @Column({ type: 'varchar', nullable: false })
  number: number;

  @Column({ type: 'varchar', nullable: false })
  created_by_user_id: number;

  @Column({ type: 'varchar', nullable: false })
  created_by_user_login: string;

  @Column({ type: 'varchar', nullable: false })
  repository: string;

  @Column({ type: 'varchar', nullable: false })
  url: string;

  @Column({ nullable: true, type: 'jsonb', default: [] })
  labels: string[] | null;

  @OneToMany(() => Review, (review) => review.pull_request, {
    cascade: true,
  })
  reviews: Review[];

  constructor(
    id: number,
    title: string,
    body: string,
    assignee: string,
    assignees: string[],
    created_at: Date,
    closed_at: Date,
    number: number,
    repository: string,
    created_by_user_id: number,
    created_by_user_login: string,
    url: string,
    reviews: Review[],
    labels: string[]
  ) {
    this.id = id;
    this.title = title;
    this.body = body;
    this.assignee = assignee;
    this.assignees = assignees;
    this.created_at = created_at;
    this.closed_at = closed_at;
    this.number = number;
    this.repository = repository;
    this.created_by_user_id = created_by_user_id;
    this.created_by_user_login = created_by_user_login;
    this.url = url;
    this.reviews = reviews;
    this.labels = labels;
  }
}
