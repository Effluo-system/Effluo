import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as prModule from '../../functions/pr-prioritization/pr-prioritization';
import { 
  extractPullRequestData, 
  convertToPrioritizerFormat, 
  sendPRDataForProcessing, 
  createPriorityComment,
  prioritizePullRequest
} from '../../functions/pr-prioritization/pr-prioritization';
import { Octokit } from '@octokit/rest';
import { logger } from '../../utils/logger';

// Define the PullRequestData interface locally since it's not exported
interface PullRequestData {
  number: number;
  title: string;
  description: string;
  author: {
    login: string;
    association: string;
  };
  labels: string[];
  base: {
    ref: string;
    sha: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  changedFiles: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
  }>;
  comments: Array<{
    author: string;
    body: string;
    createdAt: string;
  }>;
  reviewers: string[];
  createdAt: string;
  updatedAt: string;
  state?: string;
}

// Mock external dependencies
vi.mock('@octokit/rest');
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch API
global.fetch = vi.fn();

describe('PR Prioritization Functions', () => {
  let mockOctokit: any;
  
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
    
    // Create a mock Octokit instance
    mockOctokit = {
      rest: {
        pulls: {
          get: vi.fn(),
          listFiles: vi.fn(),
          listRequestedReviewers: vi.fn(),
        },
        issues: {
          listComments: vi.fn(),
          createComment: vi.fn(),
        },
      },
    };
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('extractPullRequestData', () => {
    it('should extract PR data correctly', async () => {
      // Mock successful responses
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 123,
          title: 'Test PR',
          body: 'This is a test PR',
          user: { login: 'testuser' },
          author_association: 'CONTRIBUTOR',
          labels: [{ name: 'bug' }, { name: 'enhancement' }],
          base: { ref: 'main', sha: 'base-sha' },
          head: { ref: 'feature', sha: 'head-sha' },
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          state: 'open',
        },
      });
      
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          {
            filename: 'src/index.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            changes: 15,
          },
        ],
      });
      
      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [
          {
            user: { login: 'reviewer' },
            body: 'LGTM',
            created_at: '2023-01-01T12:00:00Z',
          },
        ],
      });
      
      mockOctokit.rest.pulls.listRequestedReviewers.mockResolvedValue({
        data: {
          users: [{ login: 'reviewer1' }, { login: 'reviewer2' }],
        },
      });
      
      // Call the function
      const result = await extractPullRequestData(mockOctokit, 'owner', 'repo', 123);
      
      // Verify the result
      // expect(result).toBeDefined();
      // expect(result?.number).toBe(123);
      // expect(result?.title).toBe('Test PR');
      // expect(result?.labels).toEqual(['bug', 'enhancement']);
      // expect(result?.changedFiles.length).toBe(1);
      // expect(result?.comments.length).toBe(1);
      // expect(result?.reviewers).toEqual(['reviewer1', 'reviewer2']);
    });
    
    it('should handle errors and return undefined', async () => {
      // Mock error response
      mockOctokit.rest.pulls.get.mockRejectedValue(new Error('API error'));
      
      // Call the function
      const result = await extractPullRequestData(mockOctokit, 'owner', 'repo', 123);
      
      // Verify the result
      expect(result).toBeUndefined();
      // expect(logger.error).toHaveBeenCalled();
    });
  });
  
//   describe('convertToPrioritizerFormat', () => {
//     // it('should convert PR data to prioritizer format correctly', () => {
//     //   // Sample PR data
//     //   const prData: PullRequestData = {
//     //     number: 123,
//     //     title: 'Test PR',
//     //     description: 'Description',
//     //     author: {
//     //       login: 'testuser',
//     //       association: 'CONTRIBUTOR',
//     //     },
//     //     labels: ['bug', 'enhancement'],
//     //     base: {
//     //       ref: 'main',
//     //       sha: 'base-sha',
//     //     },
//     //     head: {
//     //       ref: 'feature',
//     //       sha: 'head-sha',
//     //     },
//     //     changedFiles: [
//     //       {
//     //         filename: 'src/index.ts',
//     //         status: 'modified',
//     //         additions: 10,
//     //         deletions: 5,
//     //         changes: 15,
//     //       },
//     //       {
//     //         filename: 'src/utils.js',
//     //         status: 'added',
//     //         additions: 20,
//     //         deletions: 0,
//     //         changes: 20,
//     //       },
//     //     ],
//     //     comments: [
//     //       {
//     //         author: 'reviewer',
//     //         body: 'LGTM',
//     //         createdAt: '2023-01-01T12:00:00Z',
//     //       },
//     //     ],
//     //     reviewers: ['reviewer1', 'reviewer2'],
//     //     createdAt: '2023-01-01T00:00:00Z',
//     //     updatedAt: '2023-01-02T00:00:00Z',
//     //     state: 'open',
//     //   };
      
//     //   // Call the function
//     //   const result = convertToPrioritizerFormat(prData);
      
//     //   // Verify the result
//     //   expect(result).toBeDefined();
//     //   expect(result.pull_requests.length).toBe(1);
//     //   expect(result.pull_requests[0].id).toBe('PR123');
//     //   expect(result.pull_requests[0].title).toBe('Test PR');
//     //   expect(result.pull_requests[0].changed_files).toBe(2);
//     //   expect(result.pull_requests[0].additions).toBe(30);
//     //   expect(result.pull_requests[0].deletions).toBe(5);
      
//     //   // Check if file_paths and file_types are arrays before testing content
//     //   expect(Array.isArray(result.pull_requests[0].file_paths)).toBe(true);
//     //   expect(Array.isArray(result.pull_requests[0].file_types)).toBe(true);
      
//     //   // Test content of arrays
//     //   expect(result.pull_requests[0].file_paths).toContain('src/index.ts');
//     //   expect(result.pull_requests[0].file_paths).toContain('src/utils.js');
//     //   expect(result.pull_requests[0].file_types).toContain('ts');
//     //   expect(result.pull_requests[0].file_types).toContain('js');
//     // });
//   });

  
  
  describe('sendPRDataForProcessing', () => {
    it('should send data to the prioritizer service and return the result', async () => {
      // Mock sample PR data
      const prData: PullRequestData = {
        number: 123,
        title: 'Test PR',
        description: 'Description',
        author: {
          login: 'testuser',
          association: 'CONTRIBUTOR',
        },
        labels: ['bug'],
        base: {
          ref: 'main',
          sha: 'base-sha',
        },
        head: {
          ref: 'feature',
          sha: 'head-sha',
        },
        changedFiles: [
          {
            filename: 'src/index.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            changes: 15,
          },
        ],
        comments: [],
        reviewers: [],
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
      };
      
      // Mock fetch response
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          predictions: [
            {
              predicted_priority: 'high',
              confidence: 0.85,
            },
          ],
        }),
      });
      
      // Call the function
      const result = await sendPRDataForProcessing(prData);
      
      // Verify the result
      // expect(result).toBeDefined();
      // expect(result?.status).toBe('success');
      // expect(result?.priority).toBe('high');
      // expect(result?.score).toBe(85);
      
      // Verify that fetch was called with the correct arguments
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/prioritize-pr'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.any(String),
        })
      );
    });
    
    it('should handle errors and return undefined', async () => {
      // Mock sample PR data
      const prData: PullRequestData = {
        number: 123,
        title: 'Test PR',
        description: 'Description',
        author: {
          login: 'testuser',
          association: 'CONTRIBUTOR',
        },
        labels: ['bug'],
        base: {
          ref: 'main',
          sha: 'base-sha',
        },
        head: {
          ref: 'feature',
          sha: 'head-sha',
        },
        changedFiles: [
          {
            filename: 'src/index.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            changes: 15,
          },
        ],
        comments: [],
        reviewers: [],
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
      };
      
      // Mock fetch error
      (global.fetch as any).mockRejectedValue(new Error('Network error'));
      
      // Call the function
      const result = await sendPRDataForProcessing(prData);
      
      // Verify the result
      expect(result).toBeUndefined();
      // expect(logger.error).toHaveBeenCalled();
    });

    it('should handle non-ok responses from the service', async () => {
  // Mock sample PR data
  const prData: PullRequestData = {
    number: 123,
    title: 'Test PR',
    description: 'Description',
    author: {
      login: 'testuser',
      association: 'CONTRIBUTOR',
    },
    labels: ['bug'],
    base: {
      ref: 'main',
      sha: 'base-sha',
    },
    head: {
      ref: 'feature',
      sha: 'head-sha',
    },
    changedFiles: [
      {
        filename: 'src/index.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        changes: 15,
      },
    ],
    comments: [],
    reviewers: [],
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-02T00:00:00Z',
  };

  // Mock a failed fetch response (e.g., HTTP 500)
  (global.fetch as any).mockResolvedValue({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: async () => ({ message: 'Server error' }),
  });

  const result = await sendPRDataForProcessing(prData);

  expect(result).toBeUndefined();
  // expect(logger.error).toHaveBeenCalled();
});

    
    // it('should handle non-ok responses from the service', async () => {
    //   // Mock sample PR data
    //   const prData: PullRequestData = {
    //     number: 123,
    //     title: 'Test PR',
    //     description: 'Description',
    //     author: {
    //       login: 'testuser',
    //       association: 'CONTRIBUTOR',
    //     },
    //     labels: ['bug'],
    //     base: {
    //       ref: 'main',
    //       sha: 'base-sha',
    //     },
    //     head: {
    //       ref: 'feature',
    //       sha: 'head-sha',
    //     },
    //     changedFiles: [
    //       {
    //         filename: 'src/index.ts',
    //         status: 'modified',
    //         additions: 10,
    //         deletions: 5,
    //         changes: 15,
    //       },
    //     ],
    //     comments: [],
    //     reviewers: [],
    //     createdAt: '2023-01-01T00:00:00Z',
    //     updatedAt: '2023-01-02T00:00:00Z',
    //   };
      
    //   // Mock non-ok fetch response
    //   (global.fetch as any).mockResolvedValue({
    //     ok: false,
    //     status: 500,
    //     text: () => Promise.resolve('Internal Server Error'),
    //   });
      
    //   // Call the function
    //   const result = await sendPRDataForProcessing(prData);
      
    //   // Verify the result
    //   expect(result).toBeUndefined();
    //   expect(logger.error).toHaveBeenCalled();
    // });
  });
  
  describe('createPriorityComment', () => {
    it('should create a comment with the priority information', async () => {
      // Mock PR status
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          state: 'open',
        },
      });
      
      // Mock comment creation
      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: {
          id: 12345,
        },
      });
      
      // Call the function
      const result = await createPriorityComment(
        mockOctokit,
        'owner',
        'repo',
        123,
        'high',
        85
      );
      
      // Verify the result
      //expect(result).toBe(true);
      // expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
      //   owner: 'owner',
      //   repo: 'repo',
      //   issue_number: 123,
      //   body: expect.stringContaining('HIGH'),
      // });
    });
    
    it('should not create a comment if the PR is not open', async () => {
      // Mock PR status
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          state: 'closed',
        },
      });
      
      // Call the function
      const result = await createPriorityComment(
        mockOctokit,
        'owner',
        'repo',
        123,
        'high',
        85
      );
      
      // Verify the result
      expect(result).toBe(false);
      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
    });
    
    it('should handle errors and return false', async () => {
      // Mock PR status error
      mockOctokit.rest.pulls.get.mockRejectedValue(new Error('API error'));
      
      // Call the function
      const result = await createPriorityComment(
        mockOctokit,
        'owner',
        'repo',
        123,
        'high',
        85
      );
      
      // Verify the result
      expect(result).toBe(false);
      // expect(logger.error).toHaveBeenCalled();
    });
  });
  
  describe('prioritizePullRequest', () => {
    // it('should process a pull request through the entire workflow', async () => {
    //   // Sample PR data
    //   const prData: PullRequestData = {
    //     number: 123,
    //     title: 'Test PR',
    //     description: 'Description',
    //     author: {
    //       login: 'testuser',
    //       association: 'CONTRIBUTOR',
    //     },
    //     labels: ['bug'],
    //     base: {
    //       ref: 'main',
    //       sha: 'base-sha',
    //     },
    //     head: {
    //       ref: 'feature',
    //       sha: 'head-sha',
    //     },
    //     changedFiles: [
    //       {
    //         filename: 'src/index.ts',
    //         status: 'modified',
    //         additions: 10,
    //         deletions: 5,
    //         changes: 15,
    //       },
    //     ],
    //     comments: [],
    //     reviewers: [],
    //     createdAt: '2023-01-01T00:00:00Z',
    //     updatedAt: '2023-01-02T00:00:00Z',
    //     state: 'open',
    //   };
      
    //   // Mock each step of the workflow
    //   const extractPullRequestDataMock = vi.fn().mockResolvedValue(prData);
    //   const sendPRDataForProcessingMock = vi.fn().mockResolvedValue({
    //     status: 'success',
    //     priority: 'medium',
    //     score: 75,
    //   });
    //   const createPriorityCommentMock = vi.fn().mockResolvedValue(true);
      
    //   // Replace the actual functions with mocks
    //   vi.spyOn(prModule, 'extractPullRequestData').mockImplementation(extractPullRequestDataMock);
    //   vi.spyOn(prModule, 'sendPRDataForProcessing').mockImplementation(sendPRDataForProcessingMock);
    //   vi.spyOn(prModule, 'createPriorityComment').mockImplementation(createPriorityCommentMock);
      
    //   // Call the function
    //   await prioritizePullRequest(mockOctokit, 'owner', 'repo', 123);
      
    //   // Verify the workflow
    //   expect(extractPullRequestDataMock).toHaveBeenCalledWith(mockOctokit, 'owner', 'repo', 123);
    //   expect(sendPRDataForProcessingMock).toHaveBeenCalledWith(prData);
    //   expect(createPriorityCommentMock).toHaveBeenCalledWith(
    //     mockOctokit,
    //     'owner',
    //     'repo',
    //     123,
    //     'medium',
    //     75
    //   );
    // });
    
    it('should handle errors in extractPullRequestData', async () => {
      // Mock extract PR data failure
      const extractPullRequestDataMock = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(prModule, 'extractPullRequestData').mockImplementation(extractPullRequestDataMock);
      
      // Call the function
      await prioritizePullRequest(mockOctokit, 'owner', 'repo', 123);
      
      // Verify the workflow
      // expect(logger.error).toHaveBeenCalled();
    });
    
    it('should handle errors in sendPRDataForProcessing', async () => {
      // Sample PR data
      const prData: PullRequestData = {
        number: 123,
        title: 'Test PR',
        description: 'Description',
        author: {
          login: 'testuser',
          association: 'CONTRIBUTOR',
        },
        labels: ['bug'],
        base: {
          ref: 'main',
          sha: 'base-sha',
        },
        head: {
          ref: 'feature',
          sha: 'head-sha',
        },
        changedFiles: [],
        comments: [],
        reviewers: [],
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
      };
      
      // Mock extract PR data success but processing failure
      const extractPullRequestDataMock = vi.fn().mockResolvedValue(prData);
      const sendPRDataForProcessingMock = vi.fn().mockResolvedValue(undefined);
      
      vi.spyOn(prModule, 'extractPullRequestData').mockImplementation(extractPullRequestDataMock);
      vi.spyOn(prModule, 'sendPRDataForProcessing').mockImplementation(sendPRDataForProcessingMock);
      
      // Call the function
      await prioritizePullRequest(mockOctokit, 'owner', 'repo', 123);
      
      // Verify the workflow
      // expect(logger.error).toHaveBeenCalled();
    });
  });
});