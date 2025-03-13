import { PRDiffFile } from '../../types/common';
import ts, { ScriptTarget } from 'typescript';
import * as maintainabilityService from './services/maintainability.service.js';

export const calculateReviewDifficultyOfPR = async (
  files: PRDiffFile[]
): Promise<number> => {
  const metrics: number[] = [];

  files.forEach((file) => {
    // Calculate Maintainability (0-171)
    const maintainability = maintainabilityService.calculate(
      file.headContent,
      ScriptTarget.ES2015
    );
    metrics.push(171 - maintainability.averageMaintainability);
  });

  const difficulty = metrics.reduce((acc, val) => (acc = acc + val), 0);
  return difficulty;
};
