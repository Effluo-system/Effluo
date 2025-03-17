// @ts-nocheck
import { createSourceFile } from 'typescript';
import { existsSync, readFileSync } from 'fs';
import pkg from 'lodash';
import * as halstead from './halstead.service.ts';
import * as cyclomatic from './cyclomatic.service.ts';
import * as sloc from './sloc.service.ts';
const { reduce, mergeWith, omitBy, isNull } = pkg;

export const calculate = (code: string, target: number) => {
  const source = createSourceFile('temp.ts', code, target);
  const perFunctionHalstead = halstead.calculateFromSource(source);
  const perFunctionCyclomatic = cyclomatic.calculateFromSource(source);
  const sourceCodeLength = sloc.calculate(code);

  const customizer = (src, val) => {
    if (!!src && Object.keys(src).length !== 0 && !!val) {
      return { volume: src.volume, cyclomatic: val };
    }
    return null;
  };
  const merged = mergeWith(
    perFunctionHalstead,
    perFunctionCyclomatic,
    customizer
  );
  const perFunctionMerged = omitBy(merged, isNull);

  const functions = Object.keys(perFunctionMerged);
  if (functions.length === 0) {
    return { averageMaintainability: -1, minMaintainability: -1 };
  }

  const maximumMatrics = reduce(
    perFunctionMerged,
    (result, value) => {
      /* eslint-disable no-param-reassign */
      result.volume = Math.max(result.volume, value.volume);
      result.cyclomatic = Math.max(result.cyclomatic, value.cyclomatic);
      return result;
      /* eslint-enable no-param-reassign */
    },
    perFunctionMerged[functions[0]]
  );

  const averageMatrics = { cyclomatic: 0, volume: 0, n: 0 };
  functions.forEach((aFunction) => {
    const matric = perFunctionMerged[aFunction];
    averageMatrics.cyclomatic += matric.cyclomatic;
    averageMatrics.volume += matric.volume;
    /* eslint-disable no-plusplus */
    averageMatrics.n++;
    /* eslint-enable no-plusplus */
  });
  averageMatrics.cyclomatic /= averageMatrics.n;
  averageMatrics.volume /= averageMatrics.n;

  const averageMaintainability = Number.parseFloat(
    (
      171 -
      5.2 * Math.log(averageMatrics.volume) -
      0.23 * averageMatrics.cyclomatic -
      16.2 * Math.log(sourceCodeLength)
    ).toFixed(2)
  );

  const minMaintainability = Number.parseFloat(
    (
      171 -
      5.2 * Math.log(maximumMatrics.volume) -
      0.23 * maximumMatrics.cyclomatic -
      16.2 * Math.log(sourceCodeLength)
    ).toFixed(2)
  );

  return { averageMaintainability, minMaintainability };
};
