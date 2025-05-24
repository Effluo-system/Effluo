import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('pr_priority_feedbacks')
export class PrPriorityFeedback {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  owner!: string;

//   @Column({ type: 'varchar', length: 255 })
//   repo!: string;

  @Column({ type: 'int' })
  pr_number!: number;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  body!: string;

  @Column({ type: 'int', default: 0 })
  comments!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  author_association!: string;

  @Column({ type: 'int', default: 0 })
  total_additions!: number;

  @Column({ type: 'int', default: 0 })
  total_deletions!: number;

  @Column({ type: 'int', default: 0 })
  changed_files_count!: number;

  @Column({ type: 'enum', enum: ['HIGH', 'MEDIUM', 'LOW'], nullable: true })
  predicted_priority!: 'HIGH' | 'MEDIUM' | 'LOW' | null;

  @Column({ type: 'int', default: 0 })
  predicted_priority_score!: number;

  @Column({ type: 'boolean', default: false })
  priority_confirmed!: boolean;

  @Column({ type: 'enum', enum: ['HIGH', 'MEDIUM', 'LOW'], nullable: true })
  actual_priority!: 'HIGH' | 'MEDIUM' | 'LOW' | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}