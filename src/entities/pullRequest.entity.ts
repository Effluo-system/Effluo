import { Entity, Column, OneToMany, ManyToOne, Relation } from 'typeorm';
import { Review } from './review.entity.ts';
import { Repo } from './repo.entity.ts';

@Entity()
export class PullRequest {
  @Column({ type: 'varchar', primary: true, nullable: false })
  id!: string;

  @Column({ type: 'varchar', nullable: false })
  title!: string;

  @Column({ type: 'varchar', nullable: true })
  body!: string | null;

  @Column({ type: 'varchar', nullable: true })
  assignee!: string | null;

  @Column({ nullable: true, type: 'jsonb', default: [] })
  assignees!: string[] | null;

  @Column({ type: 'varchar', nullable: false })
  created_at!: Date;

  @Column({ type: 'varchar', nullable: true })
  closed_at!: Date | null;

  @Column({ type: 'varchar', nullable: false })
  number!: number;

  @Column({ type: 'varchar', nullable: false })
  created_by_user_id!: number;

  @Column({ type: 'varchar', nullable: false })
  created_by_user_login!: string;

  @ManyToOne(() => Repo, (repo) => repo.id, {
    cascade: false,
  })
  repository!: Relation<Repo>;

  @Column({ type: 'varchar', nullable: false })
  url!: string;

  @Column({ nullable: true, type: 'jsonb', default: [] })
  labels!: string[] | null;

  @OneToMany(() => Review, (review) => review.pull_request, {
    cascade: true,
  })
  reviews!: Relation<Review[]>;

  @Column({ type: 'float', nullable: true })
  reviewDifficulty!: number;
}
