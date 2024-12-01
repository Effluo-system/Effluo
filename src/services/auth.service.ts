import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger.ts';
import { env } from '../config/env.ts';

export class AuthService {
  public static async getAccessToken(
    req: any
  ): Promise<AxiosResponse | undefined> {
    try {
      const { code } = req.body;
      const params = `client_id=${env.githubClientId}&client_secret=${env.githubClientSecret}&code=${code}`;
      const response = await axios.post(
        `https://github.com/login/oauth/access_token?${params}`,
        {},
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );
      if (response.status === 200 && response.data) {
        return response.data;
      }
    } catch (error) {
      logger.error(error);
      throw new Error('Cannot get the access token');
    }
  }

  public static async getUserDetails(
    req: any
  ): Promise<AxiosResponse | undefined> {
    try {
      const accessToken = req.headers.authorization;
      logger.info('Access token: ' + accessToken);
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: accessToken,
        },
      });
      if (response.status === 200 && response.data) {
        return response.data;
      }
    } catch (error) {
      //   logger.error(error);
      throw new Error('Cannot get the user');
    }
  }
}
