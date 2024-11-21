import { DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { PullRequest } from '../entities/pullRequest.entity.ts';
import { Review } from '../entities/review.entity.ts';

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
  entities: [PullRequest, Review],
};

export default dbConfig;
