// src/__tests__/semantic-tests/logConflictFeedback.test.ts
import { describe, it, beforeEach, expect, vi } from 'vitest';

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
    // Add other environment variables your app might need
    webhookSecret: 'fake-webhook-secret',
    port: '3000',
  },
}));

// Mock the GitHub App and related modules
vi.mock('../../config/appConfig.ts', () => ({
  app: {
    octokit: {
      rest: {
        // Mock any GitHub API methods you might need
      }
    }
  }
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

// Mock other dependencies
vi.mock('../../server/server.ts');
vi.mock('../../utils/logger.ts');

// Now import the function to test (after mocks are set up)
import { logConflictFeedback } from '../../functions/semantic-conflict-detection/semanticConflictDetection';
import { AppDataSource } from '../../server/server.ts';
import { PrFeedback } from '../../entities/prFeedback.entity.ts';
import { logger } from '../../utils/logger.ts';

describe('logConflictFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should save feedback successfully', async () => {
    const mockSave = vi.fn().mockResolvedValue({});
    const mockGetRepository = vi.fn().mockReturnValue({
      save: mockSave,
    });

    (AppDataSource.getRepository as ReturnType<typeof vi.fn>).mockImplementation(mockGetRepository);

    await logConflictFeedback(123, true, 'Conflict confirmed');

    expect(mockGetRepository).toHaveBeenCalledWith(PrFeedback);
    expect(mockSave).toHaveBeenCalledWith({
      pr_number: 123,
      conflict_confirmed: true,
      explanation: 'Conflict confirmed',
    });
    expect(logger.info).toHaveBeenCalledWith('Feedback saved successfully');
  });

  it('should log an error if saving feedback fails', async () => {
    const mockSave = vi.fn().mockRejectedValue(new Error('Database error'));
    const mockGetRepository = vi.fn().mockReturnValue({
      save: mockSave,
    });

    (AppDataSource.getRepository as ReturnType<typeof vi.fn>).mockImplementation(mockGetRepository);

    await logConflictFeedback(123, false, null);

    expect(mockGetRepository).toHaveBeenCalledWith(PrFeedback);
    expect(mockSave).toHaveBeenCalledWith({
      pr_number: 123,
      conflict_confirmed: false,
      explanation: null,
    });
    expect(logger.error).toHaveBeenCalledWith('Error saving feedback:', expect.any(Error));
  });
});