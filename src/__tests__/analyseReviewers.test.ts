import { describe, expect, it, vi } from 'vitest';
import { ReviewService } from '../services/review.service';
import {
  analyzeReviewers,
  areSummariesEqual,
  findMostSuitableDev,
  rankDevelopersByCategory,
} from '../functions/analyse-reviewers/analyseReviewers';
import { PRReviewRequestService } from '../services/prReviewRequest.service';
import { IssueService } from '../services/issue.service';

describe('analyzeReviewers', () => {
  const repoData = {
    '894052335': {
      PawaraGunathilaka: { backend: 4 },
      Navojith: { backend: 3 },
    },
  };
  const ranks = {
    '894052335': {
      backend: [
        { user: 'PawaraGunathilaka', count: 4 },
        { user: 'Navojith', count: 3 },
      ],
    },
  };
  const mostSuitable = { '894052335': { backend: 'Navojith' } };

  it('should run analyzeReviewers function', async () => {
    const mockReviews: any[] = [
      {
        id: '2691323183',
        body: 'dsds',
        created_at: '2025-03-17T22:14:24.000+05:30',
        created_by_user_id: 147476512,
        created_by_user_login: 'PawaraGunathilaka',
        pull_request: {
          id: '2398485133',
          title: 'Backend Updates',
          body: null,
          assignee: null,
          assignees: [],
          created_at: '2025-03-17T22:06:42.000+05:30',
          closed_at: null,
          number: 72,
          created_by_user_id: 95696563,
          created_by_user_login: 'Navojith',
          repository: {
            id: '894052335',
            full_name: 'Dinal-Senadheera/Effluo-Playground',
            url: 'https://github.com/Dinal-Senadheera/Effluo-Playground',
          },
          url: 'https://github.com/Dinal-Senadheera/Effluo-Playground/pull/72',
          labels: ['backend'],
          reviewDifficulty: 16.647,
        },
      },
      {
        id: '2691670813',
        body: 'good',
        created_at: '2025-03-18T00:20:02.000+05:30',
        created_by_user_id: '147476512',
        created_by_user_login: 'PawaraGunathilaka',
        pull_request: {
          id: '2398785590',
          title: 'New test1',
          body: null,
          assignee: null,
          assignees: ['PawaraGunathilaka'],
          created_at: '2025-03-18T00:19:31.000+05:30',
          closed_at: null,
          number: '77',
          created_by_user_id: '95696563',
          created_by_user_login: 'Navojith',
          repository: {
            id: '894052335',
            full_name: 'Dinal-Senadheera/Effluo-Playground',
            url: 'https://github.com/Dinal-Senadheera/Effluo-Playground',
          },
          url: 'https://github.com/Dinal-Senadheera/Effluo-Playground/pull/77',
          labels: ['backend'],
          reviewDifficulty: 1.6,
        },
      },
      {
        id: '2691704904',
        body: 'good\r\n',
        created_at: '2025-03-18T00:32:16.000+05:30',
        created_by_user_id: '147476512',
        created_by_user_login: 'PawaraGunathilaka',
        pull_request: {
          id: '2398809360',
          title: 'New test1',
          body: null,
          assignee: null,
          assignees: ['PawaraGunathilaka'],
          created_at: '2025-03-18T00:31:44.000+05:30',
          closed_at: null,
          number: '78',
          created_by_user_id: '95696563',
          created_by_user_login: 'Navojith',
          repository: {
            id: '894052335',
            full_name: 'Dinal-Senadheera/Effluo-Playground',
            url: 'https://github.com/Dinal-Senadheera/Effluo-Playground',
          },
          url: 'https://github.com/Dinal-Senadheera/Effluo-Playground/pull/78',
          labels: ['backend'],
          reviewDifficulty: 1.6,
        },
      },
      {
        id: '2691710951',
        body: 'good',
        created_at: '2025-03-18T00:35:00.000+05:30',
        created_by_user_id: '147476512',
        created_by_user_login: 'PawaraGunathilaka',
        pull_request: {
          id: '2398809360',
          title: 'New test1',
          body: null,
          assignee: null,
          assignees: ['PawaraGunathilaka'],
          created_at: '2025-03-18T00:31:44.000+05:30',
          closed_at: null,
          number: '78',
          created_by_user_id: '95696563',
          created_by_user_login: 'Navojith',
          repository: {
            id: '894052335',
            full_name: 'Dinal-Senadheera/Effluo-Playground',
            url: 'https://github.com/Dinal-Senadheera/Effluo-Playground',
          },
          url: 'https://github.com/Dinal-Senadheera/Effluo-Playground/pull/78',
          labels: ['backend'],
          reviewDifficulty: 1.6,
        },
      },
      {
        id: '2691720756',
        body: 'good',
        created_at: '2025-03-18T00:39:46.000+05:30',
        created_by_user_id: '95696563',
        created_by_user_login: 'Navojith',
        pull_request: {
          id: '2398822842',
          title: 'New test1',
          body: null,
          assignee: null,
          assignees: ['Navojith'],
          created_at: '2025-03-18T00:39:19.000+05:30',
          closed_at: null,
          number: '80',
          created_by_user_id: '147476512',
          created_by_user_login: 'PawaraGunathilaka',
          repository: {
            id: '894052335',
            full_name: 'Dinal-Senadheera/Effluo-Playground',
            url: 'https://github.com/Dinal-Senadheera/Effluo-Playground',
          },
          url: 'https://github.com/Dinal-Senadheera/Effluo-Playground/pull/80',
          labels: ['backend'],
          reviewDifficulty: 1.6,
        },
      },
      {
        id: '2691740708',
        body: 'good',
        created_at: '2025-03-18T00:48:51.000+05:30',
        created_by_user_id: '95696563',
        created_by_user_login: 'Navojith',
        pull_request: {
          id: '2398838931',
          title: 'New test1',
          body: null,
          assignee: null,
          assignees: ['PawaraGunathilaka'],
          created_at: '2025-03-18T00:48:34.000+05:30',
          closed_at: null,
          number: '84',
          created_by_user_id: '95696563',
          created_by_user_login: 'Navojith',
          repository: {
            id: '894052335',
            full_name: 'Dinal-Senadheera/Effluo-Playground',
            url: 'https://github.com/Dinal-Senadheera/Effluo-Playground',
          },
          url: 'https://github.com/Dinal-Senadheera/Effluo-Playground/pull/84',
          labels: ['backend'],
          reviewDifficulty: 1.6,
        },
      },
      {
        id: '2691784782',
        body: 'sd',
        created_at: '2025-03-18T01:08:44.000+05:30',
        created_by_user_id: '95696563',
        created_by_user_login: 'Navojith',
        pull_request: {
          id: '2398874991',
          title: 'New test1',
          body: null,
          assignee: null,
          assignees: ['PawaraGunathilaka'],
          created_at: '2025-03-18T01:08:30.000+05:30',
          closed_at: null,
          number: '86',
          created_by_user_id: '95696563',
          created_by_user_login: 'Navojith',
          repository: {
            id: '894052335',
            full_name: 'Dinal-Senadheera/Effluo-Playground',
            url: 'https://github.com/Dinal-Senadheera/Effluo-Playground',
          },
          url: 'https://github.com/Dinal-Senadheera/Effluo-Playground/pull/86',
          labels: ['backend'],
          reviewDifficulty: 1.6,
        },
      },
    ];

    const getReviewsMadeInTheCurrentWeekMock = vi
      .spyOn(ReviewService, 'getReviewsMadeInTheCurrentWeek')
      .mockResolvedValue(mockReviews);

    vi.mock('../functions/analyse-reviewers/analyseReviewers', async (importOriginal) => {
      const actual = await importOriginal();
      return Object.assign({}, actual, {
        rankDevelopersByCategory: vi.fn().mockRejectedValue({
          '894052335': {
            backend: [
              { user: 'PawaraGunathilaka', count: 4 },
              { user: 'Navojith', count: 3 },
            ],
          },
        }),
        findMostSuitableDev: vi.fn().mockRejectedValue({ '894052335': { backend: 'Navojith' } }),
        fetchSummaryForEachRepo: vi.fn(),
      });
    });


    const result = await analyzeReviewers();
    expect(getReviewsMadeInTheCurrentWeekMock).toHaveBeenCalled();
    expect(result).toBeTruthy();
    getReviewsMadeInTheCurrentWeekMock.mockRestore();
  });

  it('should run areSummariesEqual()', async () => {
    const result = areSummariesEqual(
      { backend: 'Navojith' },
      { backend: 'Navojith' }
    );
    expect(result).toBeTruthy();
  });

  it('should return true when areSummariesEqual() called and summaries are equal', async () => {
    const result = areSummariesEqual(
      { backend: 'Navojith' },
      { backend: 'Navojith' }
    );
    expect(result).toBe(true);
  });

  it('should return false when areSummariesEqual() called and summaries are not equal', async () => {
    const result = areSummariesEqual(
      { backend: 'Navojith' },
      { frontend: 'Navojith' }
    );
    expect(result).toBe(false);
  });

  it('should return false when areSummariesEqual() called and summaries are not equal', async () => {
    const result = areSummariesEqual(
      { backend: 'Navojith' },
      { frontend: 'Dinal' }
    );
    expect(result).toBe(false);
  });

  it('should return false when areSummariesEqual() called and summaries are not equal', async () => {
    const result = areSummariesEqual(
      { backend: 'Navojith' },
      { backend: 'Dinal' }
    );
    expect(result).toBe(false);
  });

  it('should run rankDevelopersByCategory()', async () => {
    const result = rankDevelopersByCategory(repoData);
    expect(result).toBeTruthy();
  });

  it('should run rankDevelopersByCategory() and return the refactored output', async () => {
    const result = rankDevelopersByCategory(repoData);
    expect(result).toBeDefined();
  });

  it('should run findMostSuitableDev()', async () => {
    const result = findMostSuitableDev(ranks);
    expect(result).toBeTruthy();
  });

  it('should run findMostSuitableDev() and return {}', async () => {
    const result = findMostSuitableDev(ranks);
    expect(result).toBeDefined();
  });
});
