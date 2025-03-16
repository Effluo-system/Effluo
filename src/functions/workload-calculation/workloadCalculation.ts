import { PRDiffFile } from '../../types/common';
import ts, { ScriptTarget } from 'typescript';
import * as maintainabilityService from './services/maintainability.service.js';
import * as cyclomaticService from './services/cyclomatic.service.js';

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
    const inverseMI =
      171 -
      (maintainability.averageMaintainability >= 0
        ? maintainability.averageMaintainability
        : 171);

    const LOC = file.headContent.split('\n').length;
    const cyclomatic = cyclomaticService.calculate(
      file.headContent,
      ScriptTarget.ES2015
    );
    const cc = Object.values(cyclomatic).reduce(
      (acc, val) => (acc = (acc as number) + (val as number)),
      0
    );

    metrics.push(LOC * 0.4 + (cc as number) * 0.3 + inverseMI * 0.3);
  });

  const difficulty = metrics.reduce((acc, val) => (acc = acc + val), 0);
  return parseFloat(difficulty.toFixed(4));
};
