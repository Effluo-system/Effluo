import { middleware } from './middleware.ts';
import { env } from '../config/env.ts';
import { PATH } from '../constants/common.constants.ts';
import { DataSource } from 'typeorm';
import dbConfig from '../database/db.config.ts';
import 'reflect-metadata';
import { logger } from '../utils/logger.ts';
import express from 'express';
import { logIncomingTraffic } from './loggerMiddleware.ts';
import cors from 'cors';
import http from 'http';
import { createNodeMiddleware, Webhooks } from '@octokit/webhooks';
import { app as octokitApp } from '../config/appConfig.ts';

// const server = http.createServer(middleware);
const localWebhookUrl = `http://localhost:${env.port}${PATH}`;

export const AppDataSource = new DataSource(dbConfig);

export const app = express();

// TODO: restrict cors
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logIncomingTraffic);
const server = http.createServer(middleware);
app.use(express.raw({ type: 'application/json' }), middleware);

export const startServer = async () => {
  try {
    await AppDataSource.initialize();

    logger.info('Connected to the database....');

    server.listen(env.port, () => {
      logger.info(`Server is listening for events at: ${localWebhookUrl}`);
      logger.info('Press Ctrl + C to quit.');
    });
    app.listen(3001, () => {
      logger.info(`Server is listening for events at: ${localWebhookUrl}`);
      logger.info('Press Ctrl + C to quit.');
    });
  } catch (error) {
    logger.error('Error connecting to the database:', error);
  }
};
