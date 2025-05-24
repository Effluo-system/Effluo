import { Request, Response, Router } from 'express';
import { PullRequestService } from '../services/pullRequest.service.ts';
import { getToken } from '../utils/getToken.ts';
import { RepoService } from '../services/repo.service.ts';
import { ReviewService } from '../services/review.service.ts';
import { IssueService } from '../services/issue.service.ts';
import { UserReviewSummaryService } from '../services/userReviewSummary.service.ts';
import { PRReviewRequestService } from '../services/prReviewRequest.service.ts';
import { analyzeReviewers } from '../functions/analyse-reviewers/analyseReviewers.ts';
const router = Router();

router.get('/console/prs', async (req: Request, res: Response) => {
  try {
    const token = getToken(req);
    const prs = await PullRequestService.getPullRequestsByToken(token);
    res.json(prs);
  } catch (err) {
    if ((err as Error).message === 'unauthorized')
      res.status(401).json({ message: 'Unauthorized' });
    else res.status(500).json({ message: (err as Error).message });
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

router.get('/console/reviews', async (req: Request, res: Response) => {
  try {
    const token = getToken(req);
    const reviews = await ReviewService.getReviewsByToken(token);
    res.json(reviews);
  } catch (err) {
    if ((err as Error).message === 'unauthorized')
      res.status(401).json({ message: 'Unauthorized' });
    else res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/console/issues', async (req: Request, res: Response) => {
  try {
    const token = getToken(req);
    const reviews = await IssueService.getIssuesByToken(token);
    res.json(reviews);
  } catch (err) {
    if ((err as Error).message === 'unauthorized')
      res.status(401).json({ message: 'Unauthorized' });
    else res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/console/reviewer-summary', async (req: Request, res: Response) => {
  try {
    const token = getToken(req);
    const reviews = await UserReviewSummaryService.getSummaryByToken(token);
    res.json(reviews);
  } catch (err) {
    if ((err as Error).message === 'unauthorized')
      res.status(401).json({ message: 'Unauthorized' });
    else res.status(500).json({ message: (err as Error).message });
  }
});

router.delete(
  '/console/reviewer-summary/:id',
  async (req: Request, res: Response) => {
    try {
      const token = getToken(req);
      const { id } = req.params;
      const response = await UserReviewSummaryService.deleteById(
        parseInt(id),
        token
      );
      res.json(response);
    } catch (err) {
      if ((err as Error).message === 'unauthorized')
        res.status(401).json({ message: 'Unauthorized' });
      else res.status(500).json({ message: (err as Error).message });
    }
  }
);

router.delete(
  '/console/reviewer-summary/delete-many',
  async (req: Request, res: Response) => {
    try {
      const token = getToken(req);
      const ids = req.body?.ids;
      const response = await UserReviewSummaryService.deleteManyByIds(
        ids,
        token
      );
      res.json(response);
    } catch (err) {
      if ((err as Error).message === 'unauthorized')
        res.status(401).json({ message: 'Unauthorized' });
      else res.status(500).json({ message: (err as Error).message });
    }
  }
);

router.get('/console/workload', async (req: Request, res: Response) => {
  try {
    const token = getToken(req);
    const requests = await PRReviewRequestService.getReviewRequestsByToken(
      token
    );
    const issues = await IssueService.getIssuesByToken(token);

    const weightMap: Record<string, number> = {};

    if (requests) {
      // Process PRReviewRequest assignees
      for (const request of requests) {
        if (request.assignees) {
          for (const assignee of request.assignees) {
            weightMap[assignee] = (weightMap[assignee] || 0) + request.weight;
          }
        }
      }
    }

    if (issues) {
      // Process Issue assignees
      for (const issue of issues) {
        if (issue.assignee) {
          // Handle single assignee
          weightMap[issue.assignee] =
            (weightMap[issue.assignee] || 0) + issue.weight;
        }

        if (issue.assignees) {
          // Handle multiple assignees
          for (const assignee of issue.assignees) {
            weightMap[assignee] = (weightMap[assignee] || 0) + issue.weight;
          }
        }
      }
    }
    const weightArray = Object.entries(weightMap).map(([login, weight]) => ({
      login,
      weight,
    }));
    res.json(weightArray);
  } catch (err) {
    if ((err as Error).message === 'unauthorized')
      res.status(401).json({ message: 'Unauthorized' });
    else res.status(500).json({ message: (err as Error).message });
  }
});

router.get(
  '/console/trigger-reviewer-algorithm',
  async (req: Request, res: Response) => {
    try {
      const result = await analyzeReviewers();

      res.json(result);
    } catch (err) {
      if ((err as Error).message === 'unauthorized')
        res.status(401).json({ message: 'Unauthorized' });
      else res.status(500).json({ message: (err as Error).message });
    }
  }
);
export default router;
