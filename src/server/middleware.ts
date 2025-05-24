import { createNodeMiddleware, Webhooks } from '@octokit/webhooks';
import { app } from '../config/appConfig.ts';
import { PATH } from '../constants/common.constants.ts';
import { Request, Response, NextFunction } from 'express';

export const middleware = createNodeMiddleware(
  app.webhooks as unknown as Webhooks,
  {
    path: PATH,
  }
);

export const checkAuthToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(403).json({ error: 'Invalid token' });
    return;
  }
  next();
};
