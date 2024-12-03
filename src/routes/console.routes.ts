import { Request, Response, Router } from 'express';
import { PullRequestService } from '../services/pullRequest.service.ts';
import { getToken } from '../utils/getToken.ts';
import { RepoService } from '../services/repo.service.ts';
const router = Router();

router.get('/console/prs', async (req: Request, res: Response) => {
  try {
    const token = getToken(req);
    const prs = await PullRequestService.getPullRequestsByToken(token);
    res.json(prs);
  } catch (err) {
    res.status(500).json({ message: 'Cannot get prs' });
  }
});

router.get('/console/repositories', async (req: Request, res: Response) => {
  try {
    const token = getToken(req);
    const repos = await RepoService.getReposByToken(token);
    res.json(repos);
  } catch (err) {
    if ((err as Error).message === 'unauthorized')
      res.status(401).json({ message: 'Unauthorized' });
    else res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
