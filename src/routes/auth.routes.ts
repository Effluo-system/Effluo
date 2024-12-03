import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service.ts';

const router = Router();

router.post('/auth/access-token', async (req: Request, res: Response) => {
  try {
    const accessToken = await AuthService.getAccessToken(req);
    res.json(accessToken);
  } catch (err) {
    res.status(500).json({ message: err });
  }
});

router.get('/auth/user-details', async (req: Request, res: Response) => {
  try {
    const userDetails = await AuthService.getUserDetails(req);
    res.json(userDetails);
  } catch (err) {
    res.status(500).json({ message: 'Cannot get the user' });
  }
});

export default router;
