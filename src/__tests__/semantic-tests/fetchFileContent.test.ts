// src/__tests__/semantic-tests/fetchFileContent.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock config/env BEFORE any imports that depend on it
vi.mock('../../config/env.ts', () => ({
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
vi.mock('../../utils/generateGithubJWT.ts', () => ({
  jwtToken: 'mocked-jwt-token'
}));

// Mock the GitHub App config
vi.mock('../../config/appConfig.ts', () => ({
  app: {
    octokit: {
      rest: {
        // Mock any GitHub API methods you might need
      }
    }
  }
}));

// Mock other dependencies that might be imported by the semantic conflict detection module
vi.mock('../../server/server.ts', () => ({
  AppDataSource: {
    getRepository: vi.fn()
  }
}));

vi.mock('../../utils/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));

// Now import the function to test (after mocks are set up)
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