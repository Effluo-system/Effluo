import { Entity, Column, ManyToOne } from 'typeorm';
import { PullRequest } from './pullRequest.entity.ts';

@Entity()
export class Review {
  @Column({ type: 'varchar', primary: true, nullable: false })
  id: number;

  @Column({ type: 'varchar', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', nullable: false })
  created_at: Date;

  @Column({ type: 'varchar', nullable: false })
  created_by_user_id: number;

  @Column({ type: 'varchar', nullable: false })
  created_by_user_login: string;

  @ManyToOne(() => PullRequest, (pr) => pr.reviews, {
    cascade: false,
  })
  pull_request: PullRequest | null;

  constructor(
    id: number,
    body: string,
    created_at: Date,
    created_by_user_id: number,
    created_by_user_login: string
  ) {
    this.id = id;
    this.body = body;
    this.created_at = created_at;
    this.created_by_user_id = created_by_user_id;
    this.created_by_user_login = created_by_user_login;
    this.pull_request = null;
  }
}
