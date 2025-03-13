import * as dotenv from 'dotenv';
import { DataSourceOptions } from 'typeorm';
import { MergeResolution } from '../entities/mergeResolution.entity.ts';
import { Owner } from '../entities/owner.entity.ts';
import { PullRequest } from '../entities/pullRequest.entity.ts';
import { Repo } from '../entities/repo.entity.ts';
import { Review } from '../entities/review.entity.ts';
import { UserReviewSummary } from '../entities/userReviewSummary.entity.ts';

dotenv.config();

const dbConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: true,
  logging: false,
  entities: [
    PullRequest,
    Review,
    Repo,
    Owner,
    UserReviewSummary,
    MergeResolution,
  ],
};

export default dbConfig;
