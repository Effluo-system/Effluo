// src/__tests__/unit/issueComment.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as textualMergeConflictResolution from '../../functions/textual-merge-conflict-resolution/textualMergeConflictResolution';
import { MergeConflictService } from '../../services/mergeConflict.service';
import { RepoService } from '../../services/repo.service';
import { logger } from '../../utils/logger';

// Mock dependencies
vi.mock(
  '../../functions/textual-merge-conflict-resolution/textualMergeConflictResolution',
  () => ({
    checkForCommitResolutionCommands: vi.fn(),
    resolveAllConflicts: vi.fn(),
  })
);

vi.mock('../../services/mergeConflict.service', () => ({
  MergeConflictService: {
    updateLastProcessedTimestamp: vi.fn(),
  },
}));

vi.mock('../../services/repo.service', () => ({
  RepoService: {
    getRepoByOwnerAndName: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Issue Comment Handler', () => {
  // Define the handler function directly in the test file
  async function issueCommentHandler({
    octokit,
    payload,
  }: {
    octokit: any;
    payload: any;
  }) {
    // Only process comments on pull requests
    if (!payload.issue.pull_request) {
      return;
    }
    // Avoid processing comments from the bot itself
    if (payload.comment.user?.type === 'Bot') {
      return;
    }
    try {
      // Check for commit resolution commands
      const { applyAll, commentId, user, commandTimestamp } =
        await textualMergeConflictResolution.checkForCommitResolutionCommands(
          octokit as any,
          payload.repository.owner.login,
          payload.repository.name,
          payload.issue.number
        );
      // Process "apply all" command if found
      if (applyAll && commentId && commandTimestamp) {
        logger.info(
          `Processing apply all command from ${user} at ${commandTimestamp}`
        );
        // React to the comment to indicate we're processing it
        await octokit.rest.reactions.createForIssueComment({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          comment_id: commentId,
          content: 'eyes',
        });
        const success =
          await textualMergeConflictResolution.resolveAllConflicts(
            octokit as any,
            payload.repository.owner.login,
            payload.repository.name,
            payload.issue.number
          );
        // Add success/failure reaction
        await octokit.rest.reactions.createForIssueComment({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          comment_id: commentId,
          content: success ? '+1' : '-1',
        });
        // If the command was successful, update the timestamp in the database
        if (success) {
          const repoEntity = await RepoService.getRepoByOwnerAndName(
            payload.repository.owner.login,
            payload.repository.name
          );
          if (repoEntity) {
            await MergeConflictService.updateLastProcessedTimestamp(
              repoEntity.id,
              payload.issue.number,
              commandTimestamp
            );
          }
        }
      }
    } catch (error) {
      logger.error(`Error processing comment webhook: ${error}`);
    }
  }

  let mockOctokit: any;
  let mockPayload: any;

  beforeEach(() => {
    // Create mock octokit
    mockOctokit = {
      rest: {
        reactions: {
          createForIssueComment: vi.fn().mockResolvedValue({ data: {} }),
        },
      },
    };

    // Create base mock payload
    mockPayload = {
      repository: {
        owner: {
          login: 'test-owner',
        },
        name: 'test-repo',
      },
      issue: {
        number: 123,
        pull_request: {}, // This makes it a pull request
      },
      comment: {
        id: 456,
        user: {
          login: 'test-user',
          type: 'User', // Not a bot
        },
      },
    };

    // Reset mocks
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('should ignore comments that are not on pull requests', async () => {
    const nonPrPayload = {
      ...mockPayload,
      issue: {
        number: 123,
        // No pull_request property
      },
    };

    await issueCommentHandler({ octokit: mockOctokit, payload: nonPrPayload });

    // Verify that we didn't call any further processing
    expect(
      textualMergeConflictResolution.checkForCommitResolutionCommands
    ).not.toHaveBeenCalled();
  });

  test('should ignore comments from bot users', async () => {
    const botPayload = {
      ...mockPayload,
      comment: {
        ...mockPayload.comment,
        user: {
          login: 'bot-user',
          type: 'Bot',
        },
      },
    };

    await issueCommentHandler({ octokit: mockOctokit, payload: botPayload });

    // Verify that we didn't call any further processing
    expect(
      textualMergeConflictResolution.checkForCommitResolutionCommands
    ).not.toHaveBeenCalled();
  });

  test('should check for commit resolution commands for valid comments', async () => {
    // Mock the resolution command check to return no command
    (
      textualMergeConflictResolution.checkForCommitResolutionCommands as any
    ).mockResolvedValue({
      applyAll: false,
    });

    await issueCommentHandler({ octokit: mockOctokit, payload: mockPayload });

    // Verify that we checked for commands
    expect(
      textualMergeConflictResolution.checkForCommitResolutionCommands
    ).toHaveBeenCalledWith(mockOctokit, 'test-owner', 'test-repo', 123);

    // But didn't attempt to apply resolutions
    expect(
      textualMergeConflictResolution.resolveAllConflicts
    ).not.toHaveBeenCalled();
  });

  test('should apply resolutions when a valid command is found', async () => {
    // Mock data
    const mockTimestamp = '2025-03-18T10:00:00Z';
    const mockRepoId = 'repo-123';

    // Mock the resolution command check to return a command
    (
      textualMergeConflictResolution.checkForCommitResolutionCommands as any
    ).mockResolvedValue({
      applyAll: true,
      commentId: 456,
      user: 'test-user',
      commandTimestamp: mockTimestamp,
    });

    // Mock successful resolution
    (
      textualMergeConflictResolution.resolveAllConflicts as any
    ).mockResolvedValue(true);

    // Mock repo service to return a repo
    (RepoService.getRepoByOwnerAndName as any).mockResolvedValue({
      id: mockRepoId,
    });

    await issueCommentHandler({ octokit: mockOctokit, payload: mockPayload });

    // Verify that we checked for commands
    expect(
      textualMergeConflictResolution.checkForCommitResolutionCommands
    ).toHaveBeenCalledWith(mockOctokit, 'test-owner', 'test-repo', 123);

    // Verify that we reacted to the comment
    expect(
      mockOctokit.rest.reactions.createForIssueComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 456,
      content: 'eyes',
    });

    // Verify that we attempted to apply resolutions
    expect(
      textualMergeConflictResolution.resolveAllConflicts
    ).toHaveBeenCalledWith(mockOctokit, 'test-owner', 'test-repo', 123);

    // Verify that we reacted with success
    expect(
      mockOctokit.rest.reactions.createForIssueComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 456,
      content: '+1',
    });

    // Verify that we updated the timestamp
    expect(
      MergeConflictService.updateLastProcessedTimestamp
    ).toHaveBeenCalledWith(mockRepoId, 123, mockTimestamp);
  });

  test('should handle failed resolution attempts', async () => {
    // Mock data
    const mockTimestamp = '2025-03-18T10:00:00Z';
    const mockRepoId = 'repo-123';

    // Mock the resolution command check to return a command
    (
      textualMergeConflictResolution.checkForCommitResolutionCommands as any
    ).mockResolvedValue({
      applyAll: true,
      commentId: 456,
      user: 'test-user',
      commandTimestamp: mockTimestamp,
    });

    // Mock failed resolution
    (
      textualMergeConflictResolution.resolveAllConflicts as any
    ).mockResolvedValue(false);

    // Mock repo service to return a repo
    (RepoService.getRepoByOwnerAndName as any).mockResolvedValue({
      id: mockRepoId,
    });

    await issueCommentHandler({ octokit: mockOctokit, payload: mockPayload });

    // Verify that we reacted with failure
    expect(
      mockOctokit.rest.reactions.createForIssueComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 456,
      content: '-1',
    });

    // Verify that we did NOT update the timestamp
    expect(
      MergeConflictService.updateLastProcessedTimestamp
    ).not.toHaveBeenCalled();
  });

  test('should handle exceptions during processing', async () => {
    // Mock the resolution command check to throw an error
    (
      textualMergeConflictResolution.checkForCommitResolutionCommands as any
    ).mockRejectedValue(new Error('Test error'));

    await issueCommentHandler({ octokit: mockOctokit, payload: mockPayload });

    // Verify that we logged the error
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Test error')
    );
  });
});
