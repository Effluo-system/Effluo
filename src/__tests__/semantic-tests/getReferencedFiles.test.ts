import { describe, it, expect } from 'vitest';
import { getReferencedFiles } from '../../functions/semantic-conflict-detection/semanticConflictDetection';

describe('getReferencedFiles', () => {
    it('should extract import paths from file content', () => {
      const fileContent = `
        import React from 'react';
        import { Component } from './Component';
        import { utils } from '../utils';
      `;
  
      const expected = ['react', './Component', '../utils'];
      const result = getReferencedFiles(fileContent);
  
      expect(result).toEqual(expected);
    });
  
    it('should return an empty array if no imports are found', () => {
      const fileContent = `
        const x = 10;
        function foo() {}
      `;
  
      const result = getReferencedFiles(fileContent);
      expect(result).toEqual([]);
    });
  
    it('should handle multiple imports on the same line', () => {
      const fileContent = `
        import React, { useState } from 'react';
        import { Component1, Component2 } from './components';
      `;
  
      const expected = ['react', './components'];
      const result = getReferencedFiles(fileContent);
  
      expect(result).toEqual(expected);
    });
  
    it('should ignore commented-out imports', () => {
      const fileContent = `
        // import React from 'react';
        import { Component } from './Component';
        /* import { utils } from '../utils'; */
      `;
  
      const expected = ['./Component'];
      const result = getReferencedFiles(fileContent);
  
      expect(result).toEqual(expected);
    });
  });
  