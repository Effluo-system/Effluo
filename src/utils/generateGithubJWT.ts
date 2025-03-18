import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';

export const jwtToken = jwt.sign(
  {
    iss: env.appId,
    iat: Date.now() / 1000,
    exp: Math.floor(Date.now() / 1000) + 60 * 10,
  },
  env.privateKey,
  { algorithm: 'RS256' }
);

export const createNewJWT = () => {
  const token = jwt.sign(
    {
      iss: env.appId,
      iat: Date.now() / 1000,
      exp: Math.floor(Date.now() / 1000) + 50 * 10,
    },
    env.privateKey,
    { algorithm: 'RS256' }
  );
  return token;
};
