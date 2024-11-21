import http from 'http';
import { middleware } from './middleware.ts';
import { env } from '../config/env.ts';
import { PATH } from '../constants/common.constants.ts';
import { DataSource } from 'typeorm';
import dbConfig from '../database/db.config.ts';
import 'reflect-metadata';

const server = http.createServer(middleware);
const localWebhookUrl = `http://localhost:${env.port}${PATH}`;

const AppDataSource = new DataSource(dbConfig);

export const startServer = () => {
  AppDataSource.initialize()
    .then(() => {
      console.log('Connected to the database.');
      server.listen(env.port, () => {
        console.log(`Server is listening for events at: ${localWebhookUrl}`);
        console.log('Press Ctrl + C to quit.');
      });
    })
    .catch((error) => {
      console.error('Error connecting to the database:', error);
    });
};
