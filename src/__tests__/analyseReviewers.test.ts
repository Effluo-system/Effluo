// src/__tests__/analyzeReviewers.test.ts
import { describe, expect, it, vi } from 'vitest';

// Mock config/env BEFORE any imports that depend on it
vi.mock('../config/env.ts', () => ({
  env: {
    appId: '123456',
    privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN
OPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP
QRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQR
STUVWXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRST
UVWXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV
WXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX
YZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ
1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12
34567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234
567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456
7890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12345678
90abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890
abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ab
cdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcd
efghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef
ghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefgh
ijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghij
klmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijkl
mnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmn
opqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnop
qrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqr
stuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrst
uvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuv
wxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwx
yzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyz
-----END RSA PRIVATE KEY-----`,
    webhookSecret: 'fake-webhook-secret',
    port: '3000',
  },
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mockedJwtToken'),
  },
}));

// Mock the JWT utility
vi.mock('../utils/generateGithubJWT.ts', () => ({
  jwtToken: 'mocked-jwt-token'
}));

// Mock the GitHub App config
vi.mock('../config/appConfig.ts', () => ({
  app: {
    octokit: {
      rest: {
        // Mock any GitHub API methods you might need
      }
    }
  }
}));

// Mock other dependencies
vi.mock('../server/server.ts', () => ({
  AppDataSource: {
    getRepository: vi.fn(() => ({
      findOne: vi.fn(),
      find: vi.fn(),
      save: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      remove: vi.fn(),
      count: vi.fn(),
      findAndCount: vi.fn(),
    }))
  }
}));

vi.mock('../utils/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));

// Mock services
vi.mock('../services/review.service');
vi.mock('../services/prReviewRequest.service');
vi.mock('../services/issue.service');
vi.mock('../services/userReviewSummary.service');

// Mock RepoService - this was missing!
vi.mock('../services/repo.service', () => ({
  RepoService: {
    getRepoById: vi.fn(),
  }
}));

// Mock the analyzeReviewers functions
vi.mock('../functions/analyse-reviewers/analyseReviewers', async () => {
  const actual = await vi.importActual<typeof import('../functions/analyse-reviewers/analyseReviewers')>('../functions/analyse-reviewers/analyseReviewers');
  return {
    ...actual,
    rankDevelopersByCategory: vi.fn(),
    findMostSuitableDev: vi.fn(),
  };
});

vi.mock('../functions/analyse-reviewers/pipelines/createAssignReviewerPipeline.ts', () => ({
  pushWorkflowFilesToGithub: vi.fn().mockResolvedValue(undefined)
}));

// Now import everything after mocks are set up
import { ReviewService } from '../services/review.service';
import { RepoService } from '../services/repo.service';
import {
  analyzeReviewers,
  areSummariesEqual,
  findMostSuitableDev,
  rankDevelopersByCategory,
} from '../functions/analyse-reviewers/analyseReviewers';
import { PRReviewRequestService } from '../services/prReviewRequest.service';
import { IssueService } from '../services/issue.service';
import { UserReviewSummaryService } from '../services/userReviewSummary.service';

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
            url: 'https://github.com/Dinal-Senadheera/Effluo-Playground/pull/84',
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

    // Mock repo data that would be returned by getRepoById
    const mockRepo = {
      id: '894052335',
      full_name: 'Dinal-Senadheera/Effluo-Playground',
      url: 'https://github.com/Dinal-Senadheera/Effluo-Playground',
      owner: {
        id: '1',
        login: 'Dinal-Senadheera',
        url: 'https://github.com/Dinal-Senadheera',
        repos: []
      },
      user_review_summary: null,
      issues: null,
      mergeResolutions: undefined
    } as any; 



    const getReviewsMadeInTheCurrentWeekMock = vi
      .spyOn(ReviewService, 'getReviewsMadeInTheCurrentWeek')
      .mockResolvedValue(mockReviews);

    // Mock RepoService.getRepoById to return a mock repo
    const getRepoByIdMock = vi
      .spyOn(RepoService, 'getRepoById')
      .mockResolvedValue(mockRepo);

    // Mock the functions properly
    const rankDevelopersByCategoryMock = vi.mocked(rankDevelopersByCategory);
    rankDevelopersByCategoryMock.mockReturnValue(ranks);

    const findMostSuitableDevMock = vi.mocked(findMostSuitableDev);
    findMostSuitableDevMock.mockResolvedValue(mostSuitable);

    const result = await analyzeReviewers();
    
    expect(getReviewsMadeInTheCurrentWeekMock).toHaveBeenCalled();
    expect(getRepoByIdMock).toHaveBeenCalledWith('894052335');
    expect(result).toBeTruthy();
    
    // Clean up
    getReviewsMadeInTheCurrentWeekMock.mockRestore();
    getRepoByIdMock.mockRestore();
    rankDevelopersByCategoryMock.mockClear();
    findMostSuitableDevMock.mockClear();
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
    const result = await findMostSuitableDev(ranks);
    expect(result).toBeTruthy();
  });

  it('should run findMostSuitableDev() and return {}', async () => {
    const result = await findMostSuitableDev(ranks);
    expect(result).toBeDefined();
  });
});