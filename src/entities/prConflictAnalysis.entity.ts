import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class PrConflictAnalysis {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  pr_number!: number;

  @Column()
  repository_name!: string;

  @Column()
  repository_owner!: string;

  @Column({ default: false })
  conflicts_detected!: boolean;

  @Column({ default: false })
  validation_form_posted!: boolean;

  @CreateDateColumn()
  analyzed_at!: Date;
}