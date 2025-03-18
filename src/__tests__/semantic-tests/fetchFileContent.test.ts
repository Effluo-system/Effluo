import { describe, it, expect, vi } from 'vitest';
import { fetchFileContent } from '../../functions/semantic-conflict-detection/semanticConflictDetection';

describe('fetchFileContent', () => {
  it('should return file content when the file exists', async () => {
    const mockOctokit = {
      rest: {
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: {
              type: 'file',
              content: Buffer.from('file content').toString('base64'),
            },
          }),
        },
      },
    };

    const result = await fetchFileContent(
      mockOctokit,
      'owner',
      'repo',
      'path/to/file',
      'branch'
    );

    expect(result).toBe('file content');
    expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      path: 'path/to/file',
      ref: 'branch',
    });
  });

  it('should return null if the response is not a file', async () => {
    const mockOctokit = {
      rest: {
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: {
              type: 'dir', // Not a file
            },
          }),
        },
      },
    };

    const result = await fetchFileContent(
      mockOctokit,
      'owner',
      'repo',
      'path/to/file',
      'branch'
    );

    expect(result).toBeNull();
  });

  it('should return null if the file is not found', async () => {
    const mockOctokit = {
      rest: {
        repos: {
          getContent: vi.fn().mockRejectedValue(new Error('File not found')),
        },
      },
    };

    const result = await fetchFileContent(
      mockOctokit,
      'owner',
      'repo',
      'path/to/file',
      'branch'
    );

    expect(result).toBeNull();
  });
});