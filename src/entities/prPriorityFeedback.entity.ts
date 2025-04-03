import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('pr_priority_feedbacks')
export class PrPriorityFeedback {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  pr_number!: number;

  @Column({ type: 'text' })
  predicted_priority!: 'HIGH' | 'MEDIUM' | 'LOW' | null;

  @Column({ type: 'boolean' })
  priority_confirmed!: boolean;

  @Column({ type: 'text', nullable: true })
  actual_priority!: 'HIGH' | 'MEDIUM' | 'LOW' | null;
}
