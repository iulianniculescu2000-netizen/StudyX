import { describe, expect, it } from 'vitest';
import { currentDiagramSvg } from './diagramOutcome';

describe('currentDiagramSvg', () => {
  it('never shows a completed diagram after its source or theme changed', () => {
    expect(currentDiagramSvg('dark\u0000new', undefined, { key: 'light\u0000old', svg: '<svg>old</svg>' })).toBeNull();
    expect(currentDiagramSvg('dark\u0000new', undefined, { key: 'dark\u0000new', svg: '<svg>new</svg>' })).toBe('<svg>new</svg>');
    expect(currentDiagramSvg('dark\u0000new', '<svg>cached</svg>', { key: 'light\u0000old', svg: '<svg>old</svg>' })).toBe('<svg>cached</svg>');
  });
});
