import * as dotenv from 'dotenv';
import { DataSourceOptions } from 'typeorm';
import { Issue } from '../entities/issue.entity.ts';
import { MergeResolution } from '../entities/mergeResolution.entity.ts';
import { Owner } from '../entities/owner.entity.ts';
import { PullRequest } from '../entities/pullRequest.entity.ts';
import { Repo } from '../entities/repo.entity.ts';
import { Review } from '../entities/review.entity.ts';
import { UserReviewSummary } from '../entities/userReviewSummary.entity.ts';
import createIssueTableMigration from './migrations/create-issue-table.migration.ts';
import { PRReviewRequest } from '../entities/prReviewRequest.entity.ts';
import { PrFeedback } from '../entities/prFeedback.entity.ts';
import { PrConflictAnalysis } from '../entities/prConflictAnalysis.entity.ts';
import { PrPriorityFeedback } from '../entities/prPriorityFeedback.entity.ts';

dotenv.config();

const dbConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  migrations: [createIssueTableMigration],
  logging: false,
  entities: [
    PullRequest,
    Review,
    Repo,
    Owner,
    UserReviewSummary,
    Issue,
    PRReviewRequest,
    PrFeedback,
    MergeResolution,
    PrConflictAnalysis,
    PrPriorityFeedback,
  ],
};

export default dbConfig;
