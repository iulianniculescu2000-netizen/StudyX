import { describe, expect, it } from 'vitest';
import { DIAGRAM_RULES_COMPACT } from '../../ai/diagramRules';
import { DIAGRAM_RULES } from '../../ai/promptKit';
import { estimateTextTokens } from '../../lib/ai/tokenBudget';
import { describeDiagram, parseDiagram, renderDiagramBlock } from './diagram';
import { sanitizeSvg } from './sanitize';
import { applyHighlight, attachSchemaInteraction, edgeOnPath } from './schemaInteraction';
import { SCHEMA_MAX_NODES, isSchemaFence, parseSchema } from './schemaDsl';

const labels = (source: string) => parseSchema(source)!.nodes.map((node) => node.label);

describe('parseSchema', () => {
  it('maps markers to shape and tone', () => {
    const parsed = parseSchema('! Alertă\n~ Test\n+ Tratament\n? Decizie\n. Pas\n= Final')!;
    const by = (label: string) => parsed.nodes.find((node) => node.label === label)!;
    expect(by('Alertă')).toMatchObject({ tone: 'danger', shape: 'process' });
    expect(by('Test')).toMatchObject({ tone: 'info' });
    expect(by('Tratament')).toMatchObject({ tone: 'ok' });
    expect(by('Decizie')).toMatchObject({ shape: 'decision' });
    expect(by('Pas')).toMatchObject({ tone: 'neutral', shape: 'process' });
    expect(by('Final')).toMatchObject({ shape: 'terminal' });
  });

  it('chains sequential lines and reads the title and notes', () => {
    const parsed = parseSchema('# Titlu\n! Unu | nota unu\n. Doi\n= Trei')!;
    expect(parsed.title).toBe('Titlu');
    expect(parsed.direction).toBe('TD');
    expect(parsed.nodes[0].note).toBe('nota unu');
    expect(parsed.edges.map((edge) => [edge.from, edge.to])).toEqual([['n1', 'n2'], ['n2', 'n3']]);
  });

  it('fans a decision out into labelled branches', () => {
    const parsed = parseSchema('? Ischemie?\n  da> + PCI\n  nu> ~ Troponină\n    [pozitivă]> + NSTEMI\n    [negativă]> . Alte cauze')!;
    expect(parsed.edges.map((edge) => [edge.from, edge.to, edge.label])).toEqual([
      ['n1', 'n2', 'Da'],
      ['n1', 'n3', 'Nu'],
      ['n3', 'n4', 'pozitivă'],
      ['n3', 'n5', 'negativă'],
    ]);
  });

  it('expands a causal chain on one line, left to right when it is the whole schema', () => {
    const parsed = parseSchema('Hipoxie -> Acidoză -> ! Aritmii')!;
    expect(parsed.direction).toBe('LR');
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.nodes[2].tone).toBe('danger');
    expect(parsed.edges).toHaveLength(2);
  });

  it('rejoins the flow after a branching block, skipping finished results', () => {
    const parsed = parseSchema('? Stabil?\n  da> . Observație\n  nu> = Transfer ATI\n. Reevaluare')!;
    const by = (label: string) => parsed.nodes.find((node) => node.label === label)!.id;
    const into = parsed.edges.filter((edge) => edge.to === by('Reevaluare')).map((edge) => edge.from);
    expect(into).toEqual([by('Observație')]);
  });

  it('treats unmarked lines as plain steps and unmarked questions as decisions', () => {
    const parsed = parseSchema('Pas simplu\nOare e grav?\n  da> Ceva')!;
    expect(parsed.nodes[0]).toMatchObject({ shape: 'process', tone: 'neutral' });
    expect(parsed.nodes[1].shape).toBe('decision');
  });

  it('tolerates irregular indentation, tabs, bullets, CRLF and diacritics', () => {
    const parsed = parseSchema('? Șoc septic?\r\n   - da> + Noradrenalină\r\n\t- nu> ~ Lactat\r\n  1. . Reevaluare în 2 ore')!;
    expect(parsed.nodes.map((node) => node.label)).toContain('Șoc septic?');
    expect(parsed.nodes.map((node) => node.label)).toContain('Noradrenalină');
    expect(parsed.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('decodes escaped arrows from the chat pipeline', () => {
    const parsed = parseSchema('A -&gt; B -&gt; C')!;
    expect(parsed.nodes).toHaveLength(3);
    expect(labels('Risc &lt;90 mmHg -&gt; Șoc')).toEqual(['Risc <90 mmHg', 'Șoc']);
  });

  it('keeps long labels bounded and strips markdown noise', () => {
    const parsed = parseSchema(`. **${'cuvânt '.repeat(40)}**\n. Doi`)!;
    expect(parsed.nodes[0].label.length).toBeLessThanOrEqual(100);
    expect(parsed.nodes[0].label).not.toContain('*');
  });

  it('caps the schema with a visible message instead of failing', () => {
    const source = Array.from({ length: 30 }, (_, i) => `. Pas ${i + 1}`).join('\n');
    const parsed = parseSchema(source)!;
    expect(parsed.nodes).toHaveLength(SCHEMA_MAX_NODES);
    expect(parsed.notice).toContain(String(SCHEMA_MAX_NODES));
    expect(renderDiagramBlock(source, 'schema')!).toContain('sx-notice');
  });

  it('returns null when there is nothing to draw', () => {
    expect(parseSchema('')).toBeNull();
    expect(parseSchema('# Doar titlu')).toBeNull();
    expect(parseSchema('Un singur pas')).toBeNull();
  });

  it('never throws on hostile input', () => {
    const junk = ['>>>', '|||', '-> -> ->', '[]> x', '?', '=', '\u0000\u0001', '    ', 'da>', '#'.repeat(50)];
    for (const line of junk) expect(() => parseSchema(`${line}\n${line}`)).not.toThrow();
  });
});

describe('isSchemaFence', () => {
  it('only claims schema fences that are not mermaid', () => {
    expect(isSchemaFence('schema', '? A?\n  da> B')).toBe(true);
    expect(isSchemaFence('schemă', '. A\n. B')).toBe(true);
    expect(isSchemaFence('schema', 'flowchart TD\n A --> B')).toBe(false);
    expect(isSchemaFence('mermaid', '. A\n. B')).toBe(false);
    expect(isSchemaFence('', '. A\n. B')).toBe(false);
  });
});

describe('schema rendering', () => {
  const source = '# Durere toracică\n! Durere acută | sub 20 min\n? Supradenivelare ST?\n  da> + PCI\n  nu> ~ Troponină';

  it('renders accessible, interactive, escaped svg', () => {
    const svg = renderDiagramBlock(source, 'schema')!;
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Schemă: Durere toracică.');
    expect(svg).toContain('Urgență: Durere acută');
    expect(svg).toContain('tabindex="0"');
    expect(svg).toContain('data-note="sub 20 min"');
    expect(svg).toContain('data-path=');
    expect(svg).toContain('class="sx-pill"');
    expect(svg).toContain('pathLength="1"');
    expect(svg).toContain('var(--sx-danger');
    expect(svg).not.toMatch(/<script|onclick|onmouse/i);
  });

  it('escapes hostile labels and notes', () => {
    const svg = renderDiagramBlock('. <img src=x onerror=alert(1)> | "><script>x</script>\n. Doi', 'schema')!;
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('<script');
  });

  it('keeps node paths to ancestors and descendants only', () => {
    const svg = renderDiagramBlock(source, 'schema')!;
    const path = (id: string) => new RegExp(`data-id="${id}" data-path="([^"]*)"`).exec(svg)![1].split(' ').sort();
    expect(path('n3')).toEqual(['n1', 'n2', 'n3']);
    expect(path('n4')).toEqual(['n1', 'n2', 'n4']);
    expect(path('n1')).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('staggers the entrance by depth within the time budget', () => {
    const svg = renderDiagramBlock(source, 'schema')!;
    const delays = [...svg.matchAll(/class="sx-node"[^>]*style="--d:(\d+)ms"/g)].map((m) => Number(m[1]));
    expect(delays[0]).toBe(0);
    expect(Math.max(...delays)).toBeGreaterThan(0);
    const edgeDelays = [...svg.matchAll(/class="sx-eg"[^>]*style="--d:(\d+)ms"/g)].map((m) => Number(m[1]));
    expect(Math.max(...edgeDelays) + 380 + 300).toBeLessThanOrEqual(1000);
  });

  it('survives the sanitizer with its interaction hooks intact', () => {
    const clean = sanitizeSvg(renderDiagramBlock(source, 'schema')!);
    expect(clean).toContain('data-note="sub 20 min"');
    expect(clean).toContain('tabindex="0"');
    expect(clean).toContain('aria-label=');
    expect(clean).toContain('class="sx-node"');
    expect(clean).toContain('pathLength');
  });

  it('keeps labelled fans as graphs with branch pills', () => {
    const labelled = renderDiagramBlock('? Ce?\n  [a]> . A1\n  [b]> . B1\n  [c]> . C1\n  [d]> . D1', 'schema')!;
    expect(labelled).toContain(' C ');
    expect(labelled).toContain('sx-pill');
  });

  it('keeps mermaid under a schema fence working', () => {
    const svg = renderDiagramBlock('flowchart TD\n A[Unu] --> B[Doi]', 'schema')!;
    expect(svg).toContain('Unu');
  });

  it('describes the steps for screen readers', () => {
    const parsed = parseSchema(source)!;
    expect(describeDiagram(parsed)).toMatch(/1\. Urgență: Durere acută; 2\. Decizie: Supradenivelare ST\?/);
  });

  it('keeps the plain mermaid path working with the new look', () => {
    expect(parseDiagram('graph TD\n A --> B')).not.toBeNull();
    const svg = renderDiagramBlock('graph TD\n A[Unu] --> B{Doi}\n B -->|Da| C[Trei]')!;
    expect(svg).toContain('sx-node');
    expect(svg).toContain('Decizie: Doi');
  });
});

describe('schema interaction', () => {
  const mount = () => {
    const host = document.createElement('div');
    host.innerHTML = sanitizeSvg(renderDiagramBlock('! Start | nota start\n? Decizie?\n  da> + Tratament\n  nu> ~ Test', 'schema')!);
    document.body.appendChild(host);
    return host;
  };

  it('highlights the path of a node and dims the rest', () => {
    const host = mount();
    const treat = [...host.querySelectorAll('.sx-node')].find((n) => n.textContent?.includes('Tratament'))!;
    applyHighlight(host, treat);
    const dimmed = [...host.querySelectorAll('.sx-node.sx-dim')].map((n) => n.textContent);
    expect(dimmed.some((text) => text?.includes('Test'))).toBe(true);
    expect(dimmed.some((text) => text?.includes('Start'))).toBe(false);
    const ids = new Set(treat.getAttribute('data-path')!.split(' '));
    expect([...host.querySelectorAll('.sx-eg')].filter((e) => edgeOnPath(e, ids))).toHaveLength(2);
    applyHighlight(host, null);
    expect(host.querySelectorAll('.sx-dim')).toHaveLength(0);
    host.remove();
  });

  it('pins on click, shows the note, and unpins with Escape', () => {
    const host = mount();
    const detach = attachSchemaInteraction(host);
    const start = host.querySelector('.sx-node')!;
    start.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(host.querySelector('.sx-pop')?.textContent).toBe('nota start');
    expect(host.classList.contains('sx-pinned')).toBe(true);
    start.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.querySelector('.sx-pop')).toBeNull();
    start.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(host.classList.contains('sx-pinned')).toBe(true);
    detach();
    expect(host.querySelector('.sx-pop')).toBeNull();
    host.remove();
  });

  it('does not let a node click reach the zoom handler', () => {
    const host = mount();
    const outer = document.createElement('div');
    outer.appendChild(host);
    document.body.appendChild(outer);
    let reached = 0;
    outer.addEventListener('click', () => { reached += 1; });
    const detach = attachSchemaInteraction(host);
    host.querySelector('.sx-node')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(reached).toBe(0);
    // Clicking the background while pinned only unpins; the next one bubbles on.
    host.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(reached).toBe(0);
    host.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(reached).toBe(1);
    detach();
    outer.remove();
  });
});

/* ── Token comparison: the reason this format exists ─────────────────────────────────────────── */

const EXAMPLES = [
  {
    name: 'durere toracică',
    mermaid: `flowchart TD
  A(["Durere toracică acută"]) --> B["ECG în 10 minute"]
  B --> C{"Supradenivelare ST?"}
  C -->|"Da"| D["STEMI: reperfuzie urgentă"]
  C -->|"Nu"| E["Troponină hs seriată 0/1h"]
  E --> F{"Troponină pozitivă?"}
  F -->|"Da"| G["NSTEMI: antiagregare și anticoagulare"]
  F -->|"Nu"| H["Căutare cauze alternative"]
  D --> I["Angiografie coronariană"]
  G --> J["Angiografie în 24-72 ore"]
  H --> K["Embolie pulmonară, disecție de aortă"]`,
    schema: `# Durere toracică
! Durere toracică acută
~ ECG în 10 minute
? Supradenivelare ST?
  da> + STEMI: reperfuzie urgentă
    = Angiografie coronariană
  nu> ~ Troponină hs seriată 0/1h
    ? Troponină pozitivă?
      da> + NSTEMI: antiagregare, anticoagulare
        = Angiografie în 24-72 ore
      nu> . Căutare cauze alternative
        = EP, disecție de aortă`,
  },
  {
    name: 'sepsis',
    mermaid: `flowchart TD
  A(["Suspiciune de sepsis"]) --> B["Evaluare qSOFA și lactat"]
  B --> C{"Hipotensiune sau lactat peste 4?"}
  C -->|"Da"| D["Resuscitare volemică 30 ml/kg cristaloide"]
  C -->|"Nu"| E["Antibiotic în 3 ore"]
  D --> F["Hemoculturi apoi antibiotic în 1 oră"]
  F --> G{"Hipotensiune persistentă?"}
  G -->|"Da"| H["Noradrenalină pentru MAP peste 65"]
  G -->|"Nu"| I["Reevaluare seriată a lactatului"]
  H --> J["Control sursă de infecție"]
  I --> J`,
    schema: `# Sepsis
! Suspiciune de sepsis
~ qSOFA și lactat
? Hipotensiune sau lactat peste 4?
  da> + Cristaloide 30 ml/kg
    ~ Hemoculturi, apoi antibiotic în 1 oră
    ? Hipotensiune persistentă?
      da> + Noradrenalină | țintă MAP peste 65
      nu> ~ Lactat seriat
  nu> + Antibiotic în 3 ore
= Control sursă de infecție`,
  },
  {
    name: 'cetoacidoză diabetică',
    mermaid: `flowchart TD
  A(["Suspiciune de cetoacidoză diabetică"]) --> B["Glicemie, cetone, gaze arteriale, potasiu"]
  B --> C{"pH sub 7.3 și cetone pozitive?"}
  C -->|"Da"| D["Hidratare cu ser fiziologic 1 L/oră"]
  C -->|"Nu"| E["Alt diagnostic: hiperglicemie simplă"]
  D --> F{"Potasiu sub 3.3?"}
  F -->|"Da"| G["Corectează potasiul înainte de insulină"]
  F -->|"Nu"| H["Insulină 0.1 U/kg/oră"]
  G --> H
  H --> I["Glicemie la oră, potasiu la 2 ore"]
  I --> J["Trecere la insulină subcutanată după rezolvare"]`,
    schema: `# Cetoacidoză diabetică
! Suspiciune de CAD
~ Glicemie, cetone, gaze, K+
? pH sub 7.3 și cetone pozitive?
  da> + Ser fiziologic 1 L/oră
    ? K+ sub 3.3?
      da> + Corectează K+ | înainte de insulină
      nu> + Insulină 0.1 U/kg/oră
    ~ Glicemie la oră, K+ la 2 ore
    = Insulină s.c. după rezolvare
  nu> . Alt diagnostic: hiperglicemie simplă`,
  },
];

/**
 * Symbol-aware estimate closer to a real BPE tokenizer: every punctuation mark is about one token
 * (mermaid is full of them), words cost ~1 token per 4.5 letters, whitespace is free.
 */
function symbolAwareTokens(text: string) {
  const pieces = text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
  return pieces.reduce((sum, piece) => sum + (/^[\p{L}\p{N}]+$/u.test(piece) ? Math.max(1, Math.ceil(piece.length / 4.5)) : 1), 0);
}

describe('token economy', () => {
  it('every example parses without notice and renders', () => {
    for (const example of EXAMPLES) {
      const parsed = parseSchema(example.schema);
      expect(parsed, example.name).not.toBeNull();
      expect(parsed!.notice, example.name).toBeUndefined();
      expect(renderDiagramBlock(example.schema, 'schema'), example.name).toContain('<svg');
      expect(parseDiagram(example.mermaid), example.name).not.toBeNull();
    }
  });

  it('schema needs clearly fewer tokens than mermaid', () => {
    const rows = EXAMPLES.map((example) => {
      const m = estimateTextTokens(example.mermaid);
      const s = estimateTextTokens(example.schema);
      return { name: example.name, mermaid: m, schema: s, saved: Math.round((1 - s / m) * 100) };
    });
    const totalM = rows.reduce((sum, row) => sum + row.mermaid, 0);
    const totalS = rows.reduce((sum, row) => sum + row.schema, 0);
    const saved = Math.round((1 - totalS / totalM) * 100);
    const symM = EXAMPLES.reduce((sum, example) => sum + symbolAwareTokens(example.mermaid), 0);
    const symS = EXAMPLES.reduce((sum, example) => sum + symbolAwareTokens(example.schema), 0);
    const symbolSaved = Math.round((1 - symS / symM) * 100);
    // Measured 2026-10-08: 28% (chars/3.2) and 50% (symbol-aware) fewer tokens than mermaid.
    for (const row of rows) expect(row.schema, row.name).toBeLessThan(row.mermaid * 0.85);
    expect(saved).toBeGreaterThanOrEqual(25);
    expect(symbolSaved).toBeGreaterThanOrEqual(35);
  });
});

describe('DIAGRAM_RULES_COMPACT', () => {
  it('is far smaller than the mermaid rules', () => {
    expect(estimateTextTokens(DIAGRAM_RULES_COMPACT)).toBeLessThanOrEqual(150);
    expect(estimateTextTokens(DIAGRAM_RULES_COMPACT)).toBeLessThan(estimateTextTokens(DIAGRAM_RULES) * 0.6);
  });

  it('its example parses cleanly and uses every kind of line it teaches', () => {
    const example = /```schema\n([\s\S]*?)\n```/.exec(DIAGRAM_RULES_COMPACT)![1];
    const lines = example.split('\n').length;
    expect(lines).toBeGreaterThanOrEqual(6);
    expect(lines).toBeLessThanOrEqual(8);
    const parsed = parseSchema(example)!;
    expect(parsed).not.toBeNull();
    expect(parsed.notice).toBeUndefined();
    expect(parsed.title).toBe('Durere toracică');
    expect(parsed.nodes.length).toBe(5);
    expect(parsed.edges.map((edge) => edge.label).filter(Boolean)).toEqual(['Da', 'Nu']);
    expect(renderDiagramBlock(example, 'schema')).toContain('<svg');
  });
});
