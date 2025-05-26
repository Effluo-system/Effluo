import cors from 'cors';
import express from 'express';
import http from 'http';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../config/env.ts';
import dbConfig from '../database/db.config.ts';
import { logger } from '../utils/logger.ts';
import { logIncomingTraffic } from './loggerMiddleware.ts';
import { middleware } from './middleware.ts';

// const server = http.createServer(middleware);
const localWebhookUrl = `http://localhost:${env.port}`;

export const AppDataSource = new DataSource(dbConfig);

export const app = express();

// TODO: restrict cors
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logIncomingTraffic);
const server = http.createServer(middleware);

export const startServer = async () => {
  try {
    await AppDataSource.initialize();
    logger.info('Connected to the database....');

    server.listen(env.port, () => {
      logger.info(`Server is listening for events at: ${localWebhookUrl}`);
      logger.info('Press Ctrl + C to quit.');
    });

    app.listen(3001, () => {
      logger.info(`Server is listening for events at port 3001`);
      logger.info('Press Ctrl + C to quit.');
    });
  } catch (error) {
    logger.error('Error connecting to the database:', error);
  }
};
