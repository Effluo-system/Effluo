// src/__tests__/unit/detectConflictedFiles.test.ts
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import diff3 from 'diff3';
import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { extractConflictedFiles } from '../../utils/detectConflictedFiles.ts';

// Mock the external dependencies
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('path', () => ({
  join: vi.fn().mockImplementation((...args: string[]) => args.join('/')),
}));


vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('diff3', () => ({
  default: vi.fn(),
}));

vi.mock('js-base64', () => ({
  Base64: {
    decode: vi.fn().mockImplementation((str) => `Decoded: ${str}`),
  },
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Conflict Detection', () => {
  let mockOctokit: any;

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks();

    // Set up process.cwd mock
    vi.spyOn(process, 'cwd').mockReturnValue('/fake/path');

    // Set up process.env
    process.env.GITHUB_TOKEN = 'fake-token';

    // Create mock octokit
    mockOctokit = {
      rest: {
        repos: {
          get: vi.fn(),
          compareCommits: vi.fn(),
          getContent: vi.fn(),
        },
        pulls: {
          get: vi.fn(),
          listFiles: vi.fn(),
        },
      },
    };

    // Set up default mock behavior
    (fs.mkdirSync as any).mockReturnValue(undefined);
    (fs.rmSync as any).mockReturnValue(undefined);
    (execSync as any).mockReturnValue('');
    (path.join as any).mockImplementation((...args: any[]) => args.join('/'));
    (diff3 as any).mockReturnValue([]);
  });

  afterEach(() => {
    // Clean up
    delete process.env.GITHUB_TOKEN;
  });

  describe('extractConflictedFiles', () => {
    test('should return empty array when PR is mergeable', async () => {
      // Mock PR being mergeable
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          mergeable: true,
          base: { ref: 'main' },
          head: { ref: 'feature' },
        },
      });

      const result = await extractConflictedFiles(
        mockOctokit as unknown as Octokit,
        'test-owner',
        'test-repo',
        123
      );

      expect(result).toEqual([]);
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
      });
    });

    test('should return empty array when no modified files', async () => {
      // Mock PR not being mergeable but no modified files
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          mergeable: false,
          base: { ref: 'main' },
          head: { ref: 'feature' },
        },
      });

      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          { filename: 'file1.js', status: 'added' },
          { filename: 'file2.js', status: 'removed' },
        ],
      });

      const result = await extractConflictedFiles(
        mockOctokit as unknown as Octokit,
        'test-owner',
        'test-repo',
        123
      );

      expect(result).toEqual([]);
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
      });
    });

    test('should detect conflicts using Git approach', async () => {
      // Mock PR not being mergeable with modified files
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          mergeable: false,
          base: { ref: 'main', sha: 'base-sha' },
          head: { ref: 'feature', sha: 'head-sha' },
        },
      });

      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          { filename: 'file1.js', status: 'modified' },
          { filename: 'file2.js', status: 'modified' },
        ],
      });

      // Mock repository info
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          clone_url: 'https://github.com/test-owner/test-repo.git',
        },
      });

      // Mock Git commands
      (execSync as any)
        .mockReturnValueOnce('') // git init
        .mockReturnValueOnce('') // git remote add
        .mockReturnValueOnce('') // git fetch
        .mockReturnValueOnce('') // git checkout
        .mockImplementationOnce(() => {
          // git merge - throw an error to simulate conflict
          throw new Error('Merge conflict');
        })
        .mockReturnValueOnce('file1.js\nfile2.js'); // git diff

      const result = await extractConflictedFiles(
        mockOctokit as unknown as Octokit,
        'test-owner',
        'test-repo',
        123
      );

      expect(result).toEqual(['file1.js', 'file2.js']);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git merge'),
        expect.any(Object)
      );
      expect(execSync).toHaveBeenCalledWith(
        'git diff --name-only --diff-filter=U',
        expect.any(Object)
      );
      expect(fs.rmSync).toHaveBeenCalled(); // Should clean up temp repo
    });

    test('should handle binary files correctly', async () => {
      // Mock PR not being mergeable with binary files
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          mergeable: false,
          base: { ref: 'main', sha: 'base-sha' },
          head: { ref: 'feature', sha: 'head-sha' },
        },
      });

      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          { filename: 'image.png', status: 'modified' },
          { filename: 'file.js', status: 'modified' },
        ],
      });

      // Make Git setup fail to force diff3 approach
      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API error'));

      // Mock compareCommits for merge base
      mockOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {
          merge_base_commit: { sha: 'merge-base-sha' },
        },
      });

      // Mock file content for the JS file (binary file should be skipped)
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({ data: { content: 'base-content' } })
        .mockResolvedValueOnce({ data: { content: 'our-content' } })
        .mockResolvedValueOnce({ data: { content: 'their-content' } });

      // Make diff3 detect a conflict for the JS file
      (diff3 as any).mockReturnValueOnce([{ conflict: true }]);

      const result = await extractConflictedFiles(
        mockOctokit as unknown as Octokit,
        'test-owner',
        'test-repo',
        123
      );

      expect(result).toEqual(['file.js']);
      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledTimes(3); // Only for the JS file
    });

    test('should handle errors during conflict detection', async () => {
      // Mock PR not being mergeable
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          mergeable: false,
          base: { ref: 'main', sha: 'base-sha' },
          head: { ref: 'feature', sha: 'head-sha' },
        },
      });

      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [{ filename: 'file1.js', status: 'modified' }],
      });

      // Mock Git setup failing
      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API error'));

      // Also make diff3 fallback fail
      mockOctokit.rest.repos.compareCommits.mockRejectedValue(
        new Error('Compare error')
      );

      // Try the fallback again - also fail
      mockOctokit.rest.pulls.get.mockResolvedValueOnce({
        data: {
          mergeable: false,
          base: { ref: 'main' },
          head: { ref: 'feature' },
        },
      });

      mockOctokit.rest.pulls.listFiles.mockResolvedValueOnce({
        data: [{ filename: 'file1.js', status: 'modified' }],
      });

      mockOctokit.rest.repos.compareCommits.mockRejectedValueOnce(
        new Error('Compare error')
      );

      const result = await extractConflictedFiles(
        mockOctokit as unknown as Octokit,
        'test-owner',
        'test-repo',
        123
      );

      expect(result).toEqual([]);
    });
  });

  describe('Utility Functions', () => {
    test('should properly identify binary files', async () => {
      // Import the function directly to test it
      const { isBinaryFile } = await import(
        '../../utils/detectConflictedFiles.ts'
      );

      expect(isBinaryFile('test.png')).toBe(true);
      expect(isBinaryFile('test.jpg')).toBe(true);
      expect(isBinaryFile('test.exe')).toBe(true);
      expect(isBinaryFile('test.pdf')).toBe(true);

      expect(isBinaryFile('test.js')).toBe(false);
      expect(isBinaryFile('test.ts')).toBe(false);
      expect(isBinaryFile('test.html')).toBe(false);
      expect(isBinaryFile('test.css')).toBe(false);
    });

    test('should properly identify JSON files', async () => {
      // Import the function directly to test it
      const { isJsonFile } = await import(
        '../../utils/detectConflictedFiles.ts'
      );

      expect(isJsonFile('package.json')).toBe(true);
      expect(isJsonFile('tsconfig.json')).toBe(true);
      expect(isJsonFile('.eslintrc')).toBe(true);
      expect(isJsonFile('.prettierrc')).toBe(true);

      expect(isJsonFile('test.js')).toBe(false);
      expect(isJsonFile('readme.md')).toBe(false);
    });

    test('should detect Git conflicts correctly', async () => {
      // Mock conflicting files output
      (execSync as any).mockImplementation((cmd: string | string[]) => {
        if (cmd.includes('git merge')) {
          throw new Error('Merge conflict');
        } else if (cmd.includes('git diff --name-only')) {
          return 'file1.js\nfile2.js\n';
        }
        return '';
      });

      // Import the function directly to test it
      const { getGitConflictedFiles } = await import(
        '../../utils/detectConflictedFiles.ts'
      );

      const conflictedFiles = getGitConflictedFiles('/fake/repo', 'feature');

      expect(conflictedFiles).toEqual(['file1.js', 'file2.js']);
      expect(execSync).toHaveBeenCalledWith(
        'git merge origin/feature',
        expect.any(Object)
      );
      expect(execSync).toHaveBeenCalledWith(
        'git diff --name-only --diff-filter=U',
        expect.any(Object)
      );
      expect(execSync).toHaveBeenCalledWith(
        'git merge --abort',
        expect.any(Object)
      );
    });

    test('should clean up local repo properly', async () => {
      // Import the function directly to test it
      const { cleanupLocalRepo } = await import(
        '../../utils/detectConflictedFiles.ts'
      );

      cleanupLocalRepo('/fake/repo');

      expect(fs.rmSync).toHaveBeenCalledWith('/fake/repo', {
        recursive: true,
        force: true,
      });
    });

    test('should handle Git command errors', async () => {
      // Mock execSync to throw an error
      (execSync as any).mockImplementation(() => {
        throw new Error('Git command failed');
      });

      // Import the function directly to test it
      const { executeGitCommand } = await import(
        '../../utils/detectConflictedFiles.ts'
      );

      expect(() => {
        executeGitCommand('git status', '/fake/repo');
      }).toThrow('Git command failed');
    });
  });
});
