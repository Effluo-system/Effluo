import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

export const env = {
  appId: parseInt(process.env.APP_ID || '0', 10),
  privateKeyPath: process.env.PRIVATE_KEY_PATH || '',
  privateKey: process.env.PRIVATE_KEY_PATH
    ? fs.readFileSync(process.env.PRIVATE_KEY_PATH, 'utf8')
    : '',
  secret: process.env.WEBHOOK_SECRET || '',
  enterpriseHostname: process.env.ENTERPRISE_HOSTNAME,
  port: process.env.PORT || 3000,
};
