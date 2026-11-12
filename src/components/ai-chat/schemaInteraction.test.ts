import { afterEach, describe, expect, it } from 'vitest';
import { attachSchemaInteraction } from './schemaInteraction';

function build(count: number) {
  const container = document.createElement('div');
  container.innerHTML = `<svg>${Array.from({ length: count }, (_, i) =>
    `<g class="sx-node" data-id="n${i}" data-path="n${i}" tabindex="0" role="button"></g>`).join('')}</svg>`;
  document.body.appendChild(container);
  return container;
}
const nodes = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.sx-node'));
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

afterEach(() => { document.body.innerHTML = ''; });

describe('schema roving tabindex', () => {
  it('leaves a single tab stop', () => {
    const c = build(5);
    const off = attachSchemaInteraction(c);
    expect(nodes(c).map((n) => n.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1']);
    off();
    expect(nodes(c).every((n) => n.getAttribute('tabindex') === '0')).toBe(true);
  });

  it('arrows, Home and End move focus and the tab stop', () => {
    const c = build(4);
    attachSchemaInteraction(c);
    const [a, b, , d] = nodes(c);
    a.focus();
    key(a, 'ArrowRight');
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute('tabindex')).toBe('0');
    expect(a.getAttribute('tabindex')).toBe('-1');
    key(b, 'End');
    expect(document.activeElement).toBe(d);
    key(d, 'ArrowDown');
    expect(document.activeElement).toBe(d);
    key(d, 'Home');
    expect(document.activeElement).toBe(a);
    key(a, 'ArrowLeft');
    expect(document.activeElement).toBe(a);
  });

  it('Enter still pins and Escape unpins', () => {
    const c = build(2);
    attachSchemaInteraction(c);
    const [a] = nodes(c);
    key(a, 'Enter');
    expect(c.classList.contains('sx-pinned')).toBe(true);
    key(a, 'Escape');
    expect(c.classList.contains('sx-pinned')).toBe(false);
  });
});

describe('schema graph navigation', () => {
  function tree() {
    const c = document.createElement('div');
    const node = (id: string) => `<g class="sx-node" data-id="${id}" data-path="${id}" tabindex="0" role="button"></g>`;
    const edge = (f: string, t: string, label = '') => `<g class="sx-eg" data-from="${f}" data-to="${t}">${label ? `<text>${label}</text>` : ''}</g>`;
    c.innerHTML = `<svg>${['r', 'a', 'a1', 'b'].map(node).join('')}${edge('r', 'a', 'Da')}${edge('r', 'b')}${edge('a', 'a1')}</svg>`;
    document.body.appendChild(c);
    return c;
  }
  const live = (c: HTMLElement) => c.querySelector('[data-sx-live]')?.textContent;

  it('Down = first child, Up = parent, Left/Right = siblings', () => {
    const c = tree();
    attachSchemaInteraction(c);
    const [r, a, a1, b] = nodes(c);
    r.focus();
    key(r, 'ArrowDown');
    expect(document.activeElement).toBe(a);
    expect(live(c)).toBe('Ramura: Da');
    key(a, 'ArrowRight');
    expect(document.activeElement).toBe(b);
    expect(live(c)).toBe('Ramura 2 din 2');
    key(b, 'ArrowLeft');
    key(a, 'ArrowDown');
    expect(document.activeElement).toBe(a1);
    key(a1, 'ArrowUp');
    expect(document.activeElement).toBe(a);
    key(a, 'ArrowUp');
    expect(document.activeElement).toBe(r);
    key(r, 'ArrowUp');
    expect(document.activeElement).toBe(r);
  });
});
