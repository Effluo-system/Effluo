import http from 'http';
import { middleware } from './middleware.ts';
import { env } from '../config/env.ts';
import { PATH } from '../constants/common.constants.ts';

const server = http.createServer(middleware);
const localWebhookUrl = `http://localhost:${env.port}${PATH}`;

export const startServer = () => {
  server.listen(env.port, () => {
    console.log(`Server is listening for events at: ${localWebhookUrl}`);
    console.log('Press Ctrl + C to quit.');
  });
};
