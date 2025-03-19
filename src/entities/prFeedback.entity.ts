import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('pr_feedbacks')
export class PrFeedback {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  pr_number!: number;

  @Column({ type: 'boolean' })
  conflict_confirmed!: boolean;

  @Column({ type: 'text', nullable: true })
  explanation!: string | null;
}
