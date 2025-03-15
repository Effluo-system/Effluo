import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  Relation,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Repo } from './repo.entity.ts';
import { PullRequest } from './pullRequest.entity.ts';

@Entity()
export class PRReviewRequest {
  @PrimaryGeneratedColumn()
  id?: string;

  @Column({ nullable: true, type: 'jsonb', default: [] })
  assignees!: string[] | null;

  @Column({ nullable: true, type: 'jsonb', default: [] })
  labels!: string[] | null;

  @Column({ nullable: false, type: 'float', default: 0 })
  weight!: number;

  @ManyToOne(() => PullRequest, (pr) => pr.review_requests, {
    nullable: false,
    cascade: false,
  })
  pr!: Relation<PullRequest>;
}
