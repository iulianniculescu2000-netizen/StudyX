import { describe, expect, it } from 'vitest';
import {
  BR_MARK,
  extractFences,
  hasMath,
  hasMermaid,
  isMermaidSource,
  normalizeMarkdown,
  safeUrl,
  splitMarkdownBlocks,
} from './markdown';

describe('safeUrl', () => {
  it('keeps http(s) and mailto links', () => {
    expect(safeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeUrl('HTTP://example.com')).toBe('HTTP://example.com');
    expect(safeUrl('mailto:a@b.ro')).toBe('mailto:a@b.ro');
  });

  it('drops script-capable and relative targets', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('  JaVaScRiPt:alert(1)')).toBe('');
    expect(safeUrl('java\tscript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeUrl('vbscript:x')).toBe('');
    expect(safeUrl('//evil.example/x')).toBe('');
    expect(safeUrl('/relative')).toBe('');
    expect(safeUrl(undefined)).toBe('');
  });
});

describe('extractFences / mermaid detection', () => {
  it('finds fenced blocks with their language and closed state', () => {
    const text = 'Intro\n```mermaid\ngraph TD\nA-->B\n```\ntext\n```js\nlet a = 1;';
    const fences = extractFences(text);
    expect(fences).toHaveLength(2);
    expect(fences[0]).toEqual({ lang: 'mermaid', code: 'graph TD\nA-->B', closed: true });
    expect(fences[1].lang).toBe('js');
    expect(fences[1].closed).toBe(false);
  });

  it('does not treat backticks inside a longer fence as a closing fence', () => {
    const text = '````md\n```mermaid\ngraph TD\n```\n````';
    const fences = extractFences(text);
    expect(fences).toHaveLength(1);
    expect(fences[0].lang).toBe('md');
    expect(fences[0].closed).toBe(true);
  });

  it('recognises mermaid by language or by header', () => {
    expect(isMermaidSource('mermaid', 'anything')).toBe(true);
    expect(isMermaidSource('', 'flowchart LR\nA-->B')).toBe(true);
    expect(isMermaidSource('graph', 'sequenceDiagram\nA->>B: hi')).toBe(true);
    expect(isMermaidSource('', 'just some text')).toBe(false);
    expect(isMermaidSource('python', 'graph TD')).toBe(false);
  });

  it('hasMermaid sees diagrams only inside fences', () => {
    expect(hasMermaid('```mermaid\npie\n"a": 1\n```')).toBe(true);
    expect(hasMermaid('graph TD\nA-->B')).toBe(false);
  });
});

describe('hasMath', () => {
  it('detects inline and display formulas', () => {
    expect(hasMath('Formula $E = mc^2$ simplă')).toBe(true);
    expect(hasMath('$$\\frac{a}{b}$$')).toBe(true);
  });
  it('ignores money and plain text', () => {
    expect(hasMath('Costă $5 și încă $6.')).toBe(false);
    expect(hasMath('fără formule')).toBe(false);
  });
});

describe('normalizeMarkdown', () => {
  it('turns LaTeX delimiters into dollar math', () => {
    expect(normalizeMarkdown('Ecuația \\(x^2\\) apare')).toContain('$x^2$');
    expect(normalizeMarkdown('\\[\\frac{a}{b}\\]')).toContain('$$\n\\frac{a}{b}\n$$');
    expect(normalizeMarkdown('$$a+b$$')).toBe('$$\na+b\n$$');
  });

  it('keeps math intact (structure rescue would strip "\\|" and "\\[")', () => {
    const out = normalizeMarkdown('Norma $\\|x\\|$ și $a\\_b$.');
    expect(out).toContain('$\\|x\\|$');
    expect(out).toContain('$a\\_b$');
  });

  it('escapes money so it is not parsed as a formula', () => {
    const out = normalizeMarkdown('Costă $5 acum și $10, nu $x$.');
    expect(out).toContain('\\$5');
    expect(out).toContain('\\$10');
    expect(out).toContain('$x$');
  });

  it('turns literal <br> into a placeholder outside code only', () => {
    const out = normalizeMarkdown('| A |\n|---|\n| a<br>b |\n\n```\nx<br>y\n```');
    expect(out).toContain(`a${BR_MARK}b`);
    expect(out).toContain('x<br>y');
  });

  it('leaves code fences untouched', () => {
    const code = '```\n$x$ \\( y \\) \\*\n```';
    expect(normalizeMarkdown(code)).toBe(code);
  });
});

describe('splitMarkdownBlocks', () => {
  it('splits at blank lines and keeps finished blocks stable while streaming', () => {
    const first = splitMarkdownBlocks('Primul paragraf.\n\nAl doilea înc');
    const second = splitMarkdownBlocks('Primul paragraf.\n\nAl doilea încă în curs.');
    expect(first.map((b) => b.text)).toEqual(['Primul paragraf.', 'Al doilea înc']);
    expect(second[0].text).toBe(first[0].text);
  });

  it('never splits inside a fence and flags it as open', () => {
    const blocks = splitMarkdownBlocks('Text\n\n```mermaid\ngraph TD\n\nA-->B');
    expect(blocks).toHaveLength(2);
    expect(blocks[1].open).toBe(true);
    expect(blocks[1].text).toContain('A-->B');
  });

  it('closed fences are not open', () => {
    const blocks = splitMarkdownBlocks('```mermaid\ngraph TD\nA-->B\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].open).toBe(false);
  });

  it('keeps multi-line $$ math together', () => {
    const blocks = splitMarkdownBlocks('$$\n\\frac{a}{b}\n\n+ c\n$$\n\nDupă.');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toContain('+ c');
  });

  it('merges an indented continuation into the previous block', () => {
    const blocks = splitMarkdownBlocks('- a\n\n  continuare\n\nAltceva');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toContain('continuare');
  });
});
