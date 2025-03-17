import { Entity, Column, ManyToOne, Relation } from 'typeorm';
import { PullRequest } from './pullRequest.entity.ts';

@Entity()
export class Review {
  @Column({ type: 'varchar', primary: true, nullable: false })
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  body!: string | null;

  @Column({ type: 'varchar', nullable: false })
  created_at!: Date;

  @Column({ type: 'varchar', nullable: false })
  created_by_user_id!: number;

  @Column({ type: 'varchar', nullable: false })
  created_by_user_login!: string;

  @ManyToOne(() => PullRequest, (pr) => pr.reviews, {
    onDelete: 'CASCADE',
  })
  pull_request!: Relation<PullRequest>;
}
