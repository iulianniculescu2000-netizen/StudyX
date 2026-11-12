import { beforeEach, describe, expect, it, vi } from 'vitest';

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));

vi.mock('mermaid', () => ({ default: mermaid }));

import { THEMES } from '../../theme/themes';
import { MermaidSyntaxError, buildMermaidConfig, fitMindmapRoots, mixHex, peekRendered, renderMermaid, resetMermaidRuntime } from './mermaidRuntime';
import { sanitizeSvg } from './sanitize';

beforeEach(() => {
  resetMermaidRuntime();
  mermaid.initialize.mockReset();
  mermaid.parse.mockReset().mockResolvedValue(true);
  mermaid.render.mockReset().mockResolvedValue({ svg: '<svg viewBox="0 0 10 10"><text>x</text></svg>' });
});

describe('buildMermaidConfig', () => {
  it('is strict, manual-start and label-safe', () => {
    const config = buildMermaidConfig(THEMES.light);
    expect(config.securityLevel).toBe('strict');
    expect(config.startOnLoad).toBe(false);
    expect(config.flowchart?.htmlLabels).toBe(false);
  });

  it('follows the app theme tokens in both themes', () => {
    const light = buildMermaidConfig(THEMES.light).themeVariables!;
    const dark = buildMermaidConfig(THEMES.dark).themeVariables!;
    expect(light.darkMode).toBe(false);
    expect(dark.darkMode).toBe(true);
    expect(light.primaryTextColor).toBe(THEMES.light.text);
    expect(dark.primaryTextColor).toBe(THEMES.dark.text);
    expect(light.primaryBorderColor).toBe(THEMES.light.accent);
    expect(dark.background).toBe(THEMES.dark.surface);
  });

  it('mixHex blends and tolerates non-hex input', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('rgba(0,0,0,.5)', '#ffffff', 0.5)).toBe('rgba(0,0,0,.5)');
  });
});

describe('renderMermaid', () => {
  it('gives long circular mindmap labels a content-sized card without changing their text', async () => {
    const source = 'mindmap\n  root((Psoriazis))\n    Vulgar în plăci\n    Gutat';
    expect(fitMindmapRoots(source)).toBe('mindmap\n  root[Psoriazis]\n    Vulgar în plăci\n    Gutat');
    expect(fitMindmapRoots('mindmap\n  root((BPOC))')).toContain('root((BPOC))');
    expect(fitMindmapRoots('flowchart TD\n  A((Psoriazis)) --> B')).toContain('A((Psoriazis))');
    await renderMermaid(source, THEMES.light);
    expect(mermaid.parse).toHaveBeenCalledWith(fitMindmapRoots(source), { suppressErrors: true });
    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), fitMindmapRoots(source));
  });

  it('renders, sanitizes and caches per theme', async () => {
    const svg = await renderMermaid('graph TD\nA-->B', THEMES.light);
    expect(svg).toContain('<svg');
    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    expect(peekRendered('light', 'graph TD\nA-->B')).toBe(svg);

    await renderMermaid('graph TD\nA-->B', THEMES.light);
    expect(mermaid.render).toHaveBeenCalledTimes(1);

    await renderMermaid('graph TD\nA-->B', THEMES.dark);
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(mermaid.initialize).toHaveBeenCalledTimes(2);
  });

  it('rejects with a syntax error when the source does not parse, without rendering', async () => {
    mermaid.parse.mockResolvedValue(false);
    await expect(renderMermaid('nonsense', THEMES.light)).rejects.toBeInstanceOf(MermaidSyntaxError);
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it('propagates renderer failures and cleans scratch nodes', async () => {
    mermaid.render.mockImplementation(async (id: string) => {
      const scratch = document.createElement('div');
      scratch.id = `d${id}`;
      document.body.appendChild(scratch);
      throw new Error('boom');
    });
    await expect(renderMermaid('graph TD\nA-->B', THEMES.light)).rejects.toThrow('boom');
    expect(document.querySelector('[id^="dsx-mermaid-"]')).toBeNull();
  });
});

describe('cache and configuration', () => {
  it('evicts the least recently used entry, not the oldest inserted', async () => {
    await renderMermaid('graph TD\nA-->B', THEMES.light);
    for (let i = 0; i < 119; i++) await renderMermaid(`graph TD\nN${i}-->M`, THEMES.light);
    expect(peekRendered(THEMES.light.id, 'graph TD\nA-->B')).toBeDefined(); // touched: now most recent
    await renderMermaid('graph TD\nextra-->M', THEMES.light);
    expect(peekRendered(THEMES.light.id, 'graph TD\nA-->B')).toBeDefined();
    expect(peekRendered(THEMES.light.id, 'graph TD\nN0-->M')).toBeUndefined();
  });

  it('re-initialises mermaid only when the effective config changes', async () => {
    await renderMermaid('graph TD\nA-->B', THEMES.light);
    await renderMermaid('graph TD\nC-->D', THEMES.light);
    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    await renderMermaid('graph TD\nA-->B', THEMES.dark);
    expect(mermaid.initialize).toHaveBeenCalledTimes(2);
  });
});

describe('sanitizeSvg', () => {
  it('strips scripts, handlers, foreignObject and external links', () => {
    const dirty = [
      '<svg viewBox="0 0 10 10" onload="alert(1)">',
      '<script>alert(1)</script>',
      '<foreignObject><div onclick="x()">x</div></foreignObject>',
      '<a href="javascript:alert(1)"><text onclick="y()">t</text></a>',
      '<use href="https://evil.example/x.svg#a"/>',
      '<use href="#local"/>',
      '<image href="https://evil.example/p.png"/>',
      '<text>ok</text>',
      '</svg>',
    ].join('');
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/script|onload|onclick|foreignObject|javascript:|evil\.example|<image/i);
    expect(clean).toContain('href="#local"');
    expect(clean).toContain('ok');
  });

  it('drops remote css from a theme style block but keeps the style', () => {
    const clean = sanitizeSvg('<svg><style>@import url(https://evil.example/x.css); .a{fill:red;background:url(https://evil.example/i.png)}</style><text>t</text></svg>');
    expect(clean).toContain('.a{fill:red');
    expect(clean).not.toMatch(/evil\.example|@import/);
  });
});

describe('render priority', () => {
  it('draws visible diagrams before idle ones, one at a time', async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    mermaid.render.mockImplementation(async (_id: string, code: string) => {
      active += 1; maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      order.push(code);
      active -= 1;
      return { svg: '<svg viewBox="0 0 10 10"><text>x</text></svg>' };
    });
    const t = THEMES.light;
    const first = renderMermaid('graph TD\nA-->B', t, 'visible');
    const idle = renderMermaid('graph TD\nC-->D', t, 'idle');
    const vis = renderMermaid('graph TD\nE-->F', t, 'visible');
    const promoted = renderMermaid('graph TD\nC-->D', t, 'visible');
    expect(promoted).toBe(idle);
    await Promise.all([first, idle, vis]);
    expect(order).toEqual(['graph TD\nA-->B', 'graph TD\nC-->D', 'graph TD\nE-->F']);
    expect(maxActive).toBe(1);
  });

  it('idle jobs run when nothing visible waits', async () => {
    const svg = await renderMermaid('graph TD\nX-->Y', THEMES.light, 'idle');
    expect(svg).toContain('<svg');
  });
});
