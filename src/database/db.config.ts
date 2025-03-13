import { DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { PullRequest } from '../entities/pullRequest.entity.ts';
import { Review } from '../entities/review.entity.ts';
import { Repo } from '../entities/repo.entity.ts';
import { Owner } from '../entities/owner.entity.ts';
import { UserReviewSummary } from '../entities/userReviewSummary.entity.ts';
import createIssueTableMigration from './migrations/create-issue-table.migration.ts';
import { Issue } from '../entities/issue.entity.ts';

dotenv.config();

const dbConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: true,
  migrations: [createIssueTableMigration],
  logging: false,
  entities: [PullRequest, Review, Repo, Owner, UserReviewSummary, Issue],
};

export default dbConfig;
