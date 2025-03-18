import { describe, it, beforeEach, expect, vi } from 'vitest';
import { logConflictFeedback } from '../../functions/semantic-conflict-detection/semanticConflictDetection';
import { AppDataSource } from '../../server/server.ts';
import { PrFeedback } from '../../entities/prFeedback.entity.ts';
import { logger } from '../../utils/logger.ts';

vi.mock('../../server/server.ts');
vi.mock('../../utils/logger.ts');

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
