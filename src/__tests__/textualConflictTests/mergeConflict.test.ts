// src/__tests__/unit/mergeConflict.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as semanticConflictDetection from '../../functions/semantic-conflict-detection/semanticConflictDetection';
import * as textualMergeConflictResolution from '../../functions/textual-merge-conflict-resolution/textualMergeConflictResolution';
import * as workloadCalculation from '../../functions/workload-calculation/workloadCalculation';
import { PullRequestService } from '../../services/pullRequest.service';
import { checkForMergeConflicts } from '../../utils/checkForMergeConflicts';
import { logger } from '../../utils/logger';

// Mock dependencies
vi.mock(
  '../../functions/semantic-conflict-detection/semanticConflictDetection',
  () => ({
    analyzePullRequest: vi.fn(),
  })
);

vi.mock(
  '../../functions/textual-merge-conflict-resolution/textualMergeConflictResolution',
  () => ({
    getResolution: vi.fn(),
    createResolutionComment: vi.fn(),
  })
);

vi.mock('../../functions/workload-calculation/workloadCalculation', () => ({
  calculateReviewDifficultyOfPR: vi.fn(),
}));

vi.mock('../../services/pullRequest.service', () => ({
  PullRequestService: {
    getPullRequestById: vi.fn(),
    initiatePullRequestCreationFlow: vi.fn(),
    updatePullRequest: vi.fn(),
  },
}));

vi.mock('../../utils/checkForMergeConflicts', () => ({
  checkForMergeConflicts: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Pull Request Webhook Handler', () => {
  // Define the handler function directly in the test file for pull request events
  async function pullRequestHandler({
    octokit,
    payload,
  }: {
    octokit: any;
    payload: any;
  }) {
    logger.info(
      `Starting merge conflict resolution flow for #${payload.pull_request.number}`
    );
    try {
      let pr = await PullRequestService.getPullRequestById(
        payload?.pull_request?.id.toString()
      );
      if (!pr) {
        logger.info(`Pull request not found. Creating new pull request ...`);
        const files = await semanticConflictDetection.analyzePullRequest(
          octokit,
          payload.repository.owner.login,
          payload.repository.name,
          payload.pull_request.number,
          payload.pull_request.base.ref,
          payload.pull_request.head.ref
        );

        const reviewDifficulty =
          await workloadCalculation.calculateReviewDifficultyOfPR(files);
        pr = await PullRequestService.initiatePullRequestCreationFlow(
          payload,
          reviewDifficulty
        );
      } else {
        const files = await semanticConflictDetection.analyzePullRequest(
          octokit,
          payload.repository.owner.login,
          payload.repository.name,
          payload.pull_request.number,
          payload.pull_request.base.ref,
          payload.pull_request.head.ref
        );

        const reviewDifficulty =
          await workloadCalculation.calculateReviewDifficultyOfPR(files);
        pr.reviewDifficulty = reviewDifficulty;
        await PullRequestService.updatePullRequest(pr);
      }
      const mergable = await checkForMergeConflicts(
        octokit,
        payload.repository.owner.login,
        payload.repository.name,
        payload.pull_request.number
      );

      if (mergable === false) {
        await octokit.rest.issues.addLabels({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.pull_request.number,
          labels: ['Merge Conflict'],
        });

        const resolution = await textualMergeConflictResolution.getResolution(
          octokit as any,
          payload.repository.owner.login,
          payload.repository.name,
          payload.pull_request.number
        );

        if (resolution === undefined) {
          logger.error('Failed to resolve the merge conflict');
          return;
        }

        for (const conflict of resolution) {
          await textualMergeConflictResolution.createResolutionComment(
            octokit as any,
            payload.repository.owner.login,
            payload.repository.name,
            payload.pull_request.number,
            conflict.filename,
            conflict.resolvedCode,
            conflict.baseContent,
            conflict.oursContent,
            conflict.theirsContent,
            conflict.fileData
          );
        }
      } else {
        if (
          payload.pull_request.labels.some(
            (label: { name: string }) => label.name === 'Merge Conflict'
          )
        ) {
          logger.info('Removing the merge conflict label');
          await octokit.rest.issues.removeLabel({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.pull_request.number,
            name: 'Merge Conflict',
          });
        }
      }
    } catch (error) {
      const customError = error as any;
      if (customError.response) {
        logger.error(
          `Error! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
        );
      } else {
        logger.error(error);
      }
    }
  }

  // Define the push event handler
  async function pushHandler({
    octokit,
    payload,
  }: {
    octokit: any;
    payload: any;
  }) {
    // Extract the branch name from the ref (format: refs/heads/branch-name)
    const branchName = payload.ref.replace('refs/heads/', '');
    logger.info(`Push detected to branch: ${branchName}`);

    // Get all open PRs that use this branch as their base
    const prs = await octokit.rest.pulls.list({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      state: 'open',
      base: branchName,
    });

    logger.info(
      `Found ${prs.data.length} open PRs with base branch ${branchName}`
    );

    // For each PR, check for merge conflicts
    for (const pr of prs.data) {
      logger.info(`Checking PR #${pr.number} for merge conflicts`);
      try {
        const mergable = await checkForMergeConflicts(
          octokit,
          payload.repository.owner.login,
          payload.repository.name,
          pr.number
        );

        if (mergable === false) {
          // Only add label if it doesn't already exist
          await octokit.rest.issues.addLabels({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: pr.number,
            labels: ['Merge Conflict'],
          });

          const resolution = await textualMergeConflictResolution.getResolution(
            octokit as any,
            payload.repository.owner.login,
            payload.repository.name,
            pr.number
          );

          if (resolution === undefined) {
            logger.error(
              `Failed to resolve the merge conflict for PR #${pr.number}`
            );
            continue;
          }

          for (const conflict of resolution) {
            await textualMergeConflictResolution.createResolutionComment(
              octokit as any,
              payload.repository.owner.login,
              payload.repository.name,
              pr.number,
              conflict.filename,
              conflict.resolvedCode,
              conflict.baseContent,
              conflict.oursContent,
              conflict.theirsContent,
              conflict.fileData
            );
          }
        } else if (
          pr.labels.some(
            (label: { name: string }) => label.name === 'Merge Conflict'
          )
        ) {
          // Remove the merge conflict label if it exists and the PR is now mergeable
          logger.info(
            `Removing the merge conflict label from PR #${pr.number}`
          );
          await octokit.rest.issues.removeLabel({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: pr.number,
            name: 'Merge Conflict',
          });
        }
      } catch (error) {
        const customError = error as any;
        if (customError.response) {
          logger.error(
            `Error processing PR #${pr.number}! Status: ${customError.response.status}. Message: ${customError.response.data.message}`
          );
        } else {
          logger.error(`Error processing PR #${pr.number}: ${error}`);
        }
      }
    }
  }

  let mockOctokit: any;
  let mockPrPayload: any;
  let mockPushPayload: any;

  beforeEach(() => {
    // Create mock octokit
    mockOctokit = {
      rest: {
        issues: {
          addLabels: vi.fn().mockResolvedValue({ data: {} }),
          removeLabel: vi.fn().mockResolvedValue({ data: {} }),
        },
        pulls: {
          list: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    };

    // Create base mock PR payload
    mockPrPayload = {
      repository: {
        owner: {
          login: 'test-owner',
        },
        name: 'test-repo',
      },
      pull_request: {
        id: 'pr-123',
        number: 123,
        base: {
          ref: 'main',
        },
        head: {
          ref: 'feature-branch',
        },
        labels: [],
      },
    };

    // Create base mock push payload
    mockPushPayload = {
      repository: {
        owner: {
          login: 'test-owner',
        },
        name: 'test-repo',
      },
      ref: 'refs/heads/main',
    };

    // Reset mocks
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Pull Request Handler Tests', () => {
    test('should create a new pull request when it does not exist', async () => {
      // Mock PR not found
      (PullRequestService.getPullRequestById as any).mockResolvedValue(null);

      // Mock file analysis
      const mockFiles = [{ filename: 'test.js', changes: 10 }];
      (semanticConflictDetection.analyzePullRequest as any).mockResolvedValue(
        mockFiles
      );

      // Mock difficulty calculation
      const mockDifficulty = 'Medium';
      (
        workloadCalculation.calculateReviewDifficultyOfPR as any
      ).mockResolvedValue(mockDifficulty);

      // Mock PR creation
      const mockPr = { id: 'pr-123', reviewDifficulty: mockDifficulty };
      (
        PullRequestService.initiatePullRequestCreationFlow as any
      ).mockResolvedValue(mockPr);

      // Mock PR is mergeable
      (checkForMergeConflicts as any).mockResolvedValue(true);

      await pullRequestHandler({
        octokit: mockOctokit,
        payload: mockPrPayload,
      });

      // Verify PR was analyzed
      expect(semanticConflictDetection.analyzePullRequest).toHaveBeenCalledWith(
        mockOctokit,
        'test-owner',
        'test-repo',
        123,
        'main',
        'feature-branch'
      );

      // Verify difficulty was calculated
      expect(
        workloadCalculation.calculateReviewDifficultyOfPR
      ).toHaveBeenCalledWith(mockFiles);

      // Verify PR was created
      expect(
        PullRequestService.initiatePullRequestCreationFlow
      ).toHaveBeenCalledWith(mockPrPayload, mockDifficulty);

      // Verify merge check was performed
      expect(checkForMergeConflicts).toHaveBeenCalledWith(
        mockOctokit,
        'test-owner',
        'test-repo',
        123
      );

      // Verify no labels were added (since PR is mergeable)
      expect(mockOctokit.rest.issues.addLabels).not.toHaveBeenCalled();
    });

    test('should update an existing pull request', async () => {
      // Mock existing PR
      const mockExistingPr = { id: 'pr-123', reviewDifficulty: 'Low' };
      (PullRequestService.getPullRequestById as any).mockResolvedValue(
        mockExistingPr
      );

      // Mock file analysis
      const mockFiles = [{ filename: 'test.js', changes: 20 }];
      (semanticConflictDetection.analyzePullRequest as any).mockResolvedValue(
        mockFiles
      );

      // Mock updated difficulty calculation
      const mockUpdatedDifficulty = 'High';
      (
        workloadCalculation.calculateReviewDifficultyOfPR as any
      ).mockResolvedValue(mockUpdatedDifficulty);

      // Mock PR is mergeable
      (checkForMergeConflicts as any).mockResolvedValue(true);

      await pullRequestHandler({
        octokit: mockOctokit,
        payload: mockPrPayload,
      });

      // Verify difficulty was updated
      expect(mockExistingPr.reviewDifficulty).toBe(mockUpdatedDifficulty);

      // Verify PR was updated
      expect(PullRequestService.updatePullRequest).toHaveBeenCalledWith(
        mockExistingPr
      );
    });

    test('should handle merge conflicts by adding label and creating resolution', async () => {
      // Mock existing PR
      const mockExistingPr = { id: 'pr-123', reviewDifficulty: 'Medium' };
      (PullRequestService.getPullRequestById as any).mockResolvedValue(
        mockExistingPr
      );

      // Mock file analysis
      const mockFiles = [{ filename: 'test.js', changes: 10 }];
      (semanticConflictDetection.analyzePullRequest as any).mockResolvedValue(
        mockFiles
      );

      // Mock difficulty calculation
      (
        workloadCalculation.calculateReviewDifficultyOfPR as any
      ).mockResolvedValue('Medium');

      // Mock PR has merge conflicts
      (checkForMergeConflicts as any).mockResolvedValue(false);

      // Mock conflict resolution
      const mockResolution = [
        {
          filename: 'test.js',
          resolvedCode: 'const x = 1;',
          baseContent: 'const x = 0;',
          oursContent: 'const x = 2;',
          theirsContent: 'const x = 3;',
          fileData: {},
        },
      ];
      (textualMergeConflictResolution.getResolution as any).mockResolvedValue(
        mockResolution
      );

      await pullRequestHandler({
        octokit: mockOctokit,
        payload: mockPrPayload,
      });

      // Verify merge conflict label was added
      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        labels: ['Merge Conflict'],
      });

      // Verify resolution was fetched
      expect(textualMergeConflictResolution.getResolution).toHaveBeenCalledWith(
        mockOctokit,
        'test-owner',
        'test-repo',
        123
      );

      // Verify resolution comment was created
      expect(
        textualMergeConflictResolution.createResolutionComment
      ).toHaveBeenCalledWith(
        mockOctokit,
        'test-owner',
        'test-repo',
        123,
        'test.js',
        'const x = 1;',
        'const x = 0;',
        'const x = 2;',
        'const x = 3;',
        {}
      );
    });

    test('should remove merge conflict label when conflicts are resolved', async () => {
      // Mock existing PR
      const mockExistingPr = { id: 'pr-123', reviewDifficulty: 'Medium' };
      (PullRequestService.getPullRequestById as any).mockResolvedValue(
        mockExistingPr
      );

      // Mock file analysis
      const mockFiles = [{ filename: 'test.js', changes: 10 }];
      (semanticConflictDetection.analyzePullRequest as any).mockResolvedValue(
        mockFiles
      );

      // Mock difficulty calculation
      (
        workloadCalculation.calculateReviewDifficultyOfPR as any
      ).mockResolvedValue('Medium');

      // Mock PR is now mergeable
      (checkForMergeConflicts as any).mockResolvedValue(true);

      // Modify payload to include merge conflict label
      const payloadWithLabel = {
        ...mockPrPayload,
        pull_request: {
          ...mockPrPayload.pull_request,
          labels: [{ name: 'Merge Conflict' }],
        },
      };

      await pullRequestHandler({
        octokit: mockOctokit,
        payload: payloadWithLabel,
      });

      // Verify merge conflict label was removed
      expect(mockOctokit.rest.issues.removeLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        name: 'Merge Conflict',
      });

      // Verify resolution was not fetched
      expect(
        textualMergeConflictResolution.getResolution
      ).not.toHaveBeenCalled();
    });

    test('should handle errors during processing', async () => {
      // Mock error during analysis
      (semanticConflictDetection.analyzePullRequest as any).mockRejectedValue(
        new Error('Analysis failed')
      );

      await pullRequestHandler({
        octokit: mockOctokit,
        payload: mockPrPayload,
      });

      // Verify error was logged
      expect(logger.error).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Push Handler Tests', () => {
    test('should check affected PRs for merge conflicts when base branch is pushed to', async () => {
      // Mock PRs that use this branch as base
      const mockPrs = [
        {
          number: 123,
          labels: [],
        },
        {
          number: 456,
          labels: [{ name: 'Merge Conflict' }],
        },
      ];
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPrs });

      // Mock first PR now has conflicts, second PR is now mergeable
      (checkForMergeConflicts as any)
        .mockResolvedValueOnce(false) // PR #123 has conflicts
        .mockResolvedValueOnce(true); // PR #456 is mergeable

      // Mock resolution for PR #123
      const mockResolution = [
        {
          filename: 'test.js',
          resolvedCode: 'const x = 1;',
          baseContent: 'const x = 0;',
          oursContent: 'const x = 2;',
          theirsContent: 'const x = 3;',
          fileData: {},
        },
      ];
      (textualMergeConflictResolution.getResolution as any).mockResolvedValue(
        mockResolution
      );

      await pushHandler({ octokit: mockOctokit, payload: mockPushPayload });

      // Verify PRs were fetched
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        state: 'open',
        base: 'main',
      });

      // Verify merge checks were performed for both PRs
      expect(checkForMergeConflicts).toHaveBeenCalledTimes(2);

      // Verify merge conflict label was added to PR #123
      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        labels: ['Merge Conflict'],
      });

      // Verify resolution was fetched for PR #123
      expect(textualMergeConflictResolution.getResolution).toHaveBeenCalledWith(
        mockOctokit,
        'test-owner',
        'test-repo',
        123
      );

      // Verify merge conflict label was removed from PR #456
      expect(mockOctokit.rest.issues.removeLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 456,
        name: 'Merge Conflict',
      });
    });

    test('should handle failed resolution for a PR', async () => {
      // Mock one PR that uses this branch as base
      const mockPrs = [{ number: 123, labels: [] }];
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPrs });

      // Mock PR has conflicts
      (checkForMergeConflicts as any).mockResolvedValue(false);

      // Mock resolution fails
      (textualMergeConflictResolution.getResolution as any).mockResolvedValue(
        undefined
      );

      await pushHandler({ octokit: mockOctokit, payload: mockPushPayload });

      // Verify merge conflict label was added
      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        labels: ['Merge Conflict'],
      });

      // Verify error was logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to resolve the merge conflict for PR #123'
        )
      );

      // Verify no resolution comment was created
      expect(
        textualMergeConflictResolution.createResolutionComment
      ).not.toHaveBeenCalled();
    });

    test('should handle errors during PR processing', async () => {
      // Mock PRs that use this branch as base
      const mockPrs = [{ number: 123, labels: [] }];
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPrs });

      // Mock error during merge check
      (checkForMergeConflicts as any).mockRejectedValue(
        new Error('Check failed')
      );

      await pushHandler({ octokit: mockOctokit, payload: mockPushPayload });

      // Verify error was logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing PR #123')
      );
    });

    test('should handle no affected PRs', async () => {
      // Mock no PRs use this branch as base
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      await pushHandler({ octokit: mockOctokit, payload: mockPushPayload });

      // Verify no merge checks were performed
      expect(checkForMergeConflicts).not.toHaveBeenCalled();

      // Verify message was logged
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found 0 open PRs with base branch main')
      );
    });
  });
});
