import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class PrConflictAnalysis {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('int')  
  pr_number!: number;

  @Column('varchar', { length: 255, nullable: true }) 
  repository_name!: string;

  @Column('varchar', { length: 255, nullable: true  }) 
  repository_owner!: string;

  @Column('boolean', { default: false }) 
  conflicts_detected!: boolean;

  @Column('boolean', { default: false })  
  validation_form_posted!: boolean;

  @CreateDateColumn()
  analyzed_at!: Date;
}
