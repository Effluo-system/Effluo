// @ts-nocheck
import { forEachChild, SyntaxKind, createSourceFile } from 'typescript';
import { isFunctionWithBody } from 'tsutils';
import { existsSync, readFileSync } from 'fs';

import getNodeName from '../utilities/name.utility.ts';

const increasesComplexity = (node) => {
  /* eslint-disable indent */
  switch (node.kind) {
    case SyntaxKind.CaseClause:
      return node.statements.length > 0;
    case SyntaxKind.CatchClause:
    case SyntaxKind.ConditionalExpression:
    case SyntaxKind.DoStatement:
    case SyntaxKind.ForStatement:
    case SyntaxKind.ForInStatement:
    case SyntaxKind.ForOfStatement:
    case SyntaxKind.IfStatement:
    case SyntaxKind.WhileStatement:
      return true;

    case SyntaxKind.BinaryExpression:
      switch (node.operatorToken.kind) {
        case SyntaxKind.BarBarToken:
        case SyntaxKind.AmpersandAmpersandToken:
          return true;
        default:
          return false;
      }

    default:
      return false;
  }
  /* eslint-enable indent */
};

export const calculateFromSource = (ctx) => {
  let complexity = 0;
  const output = {};
  forEachChild(ctx, function cb(node) {
    if (isFunctionWithBody(node)) {
      const old = complexity;
      complexity = 1;
      forEachChild(node, cb);
      const name = getNodeName(node);
      output[name] = complexity;
      complexity = old;
    } else {
      if (increasesComplexity(node)) {
        complexity += 1;
      }
      forEachChild(node, cb);
    }
  });
  return output;
};

export const calculate = (code: string, target: number) => {
  const source = createSourceFile('temp.ts', code, target);
  return calculateFromSource(source);
};
