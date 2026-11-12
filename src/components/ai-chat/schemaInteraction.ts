/**
 * Hover / click / keyboard behaviour for schemas drawn by `diagram.ts`.
 *
 * The SVG is injected as sanitized markup (no handlers allowed), so everything
 * is attached from outside to a container that holds it, using the data-*
 * attributes the renderer writes:
 *   .sx-node[data-id][data-path][data-note]   a step, with its whole path
 *   .sx-eg[data-from][data-to]                an edge group (to may list ids)
 *
 * Hover (or focus) = highlight the path through the node and fade the rest.
 * Click / Enter / Space = pin that path and show the node's note in a small
 * popover; clicking the same node again, the background, or Esc unpins.
 */

const DIM = 'sx-dim';
const ON = 'sx-on';
const FOCUS = 'sx-focus';
const PINNED = 'sx-pinned';

export function pathIds(node: Element): Set<string> {
  return new Set((node.getAttribute('data-path') ?? node.getAttribute('data-id') ?? '').split(' ').filter(Boolean));
}

/** An edge is on the path when it starts on it and (one of) its ends is on it too. */
export function edgeOnPath(edge: Element, ids: Set<string>): boolean {
  const from = edge.getAttribute('data-from') ?? '';
  const targets = (edge.getAttribute('data-to') ?? '').split(' ').filter(Boolean);
  return ids.has(from) && targets.some((target) => ids.has(target));
}

export function applyHighlight(root: Element, node: Element | null) {
  const nodes = root.querySelectorAll('.sx-node');
  const edges = root.querySelectorAll('.sx-eg');
  if (!node) {
    root.classList.remove(FOCUS);
    nodes.forEach((item) => item.classList.remove(DIM, ON));
    edges.forEach((item) => item.classList.remove(DIM, ON));
    return;
  }
  const ids = pathIds(node);
  root.classList.add(FOCUS);
  nodes.forEach((item) => {
    const id = item.getAttribute('data-id') ?? '';
    item.classList.toggle(DIM, !ids.has(id));
    item.classList.toggle(ON, item === node);
  });
  edges.forEach((item) => {
    const on = edgeOnPath(item, ids);
    item.classList.toggle(DIM, !on);
    item.classList.toggle(ON, on);
  });
}

export interface SchemaGraph {
  hasEdges: boolean;
  children(node: Element): Element[];
  parent(node: Element): Element | undefined;
  /** Nodes sharing the node's parent (or the roots), in DOM order. */
  siblings(node: Element): Element[];
  /** Short spoken text: the edge label ("Da") or "Ramura 2 din 3". */
  branchLabel(node: Element): string;
}

/** Parent/child relations from `.sx-eg[data-from][data-to]` between the given nodes. */
export function buildSchemaGraph(root: Element, stops: Element[]): SchemaGraph {
  const byId = new Map<string, Element>();
  stops.forEach((n) => byId.set(n.getAttribute('data-id') ?? '', n));
  const kids = new Map<Element, Element[]>();
  const parents = new Map<Element, Element>();
  const labels = new Map<string, string>();
  root.querySelectorAll('.sx-eg').forEach((edge) => {
    const from = byId.get(edge.getAttribute('data-from') ?? '');
    if (!from) return;
    (edge.getAttribute('data-to') ?? '').split(' ').filter(Boolean).forEach((toId) => {
      const to = byId.get(toId);
      if (!to || to === from || parents.has(to)) return;
      parents.set(to, from);
      kids.set(from, [...(kids.get(from) ?? []), to]);
      const label = edge.textContent?.trim();
      if (label) labels.set(`${edge.getAttribute('data-from')}>${toId}`, label);
    });
  });
  const order = (list: Element[]) => list.slice().sort((a, b) => stops.indexOf(a) - stops.indexOf(b));
  const roots = stops.filter((n) => !parents.has(n));
  const siblings = (node: Element) => {
    const p = parents.get(node);
    return p ? order(kids.get(p) ?? []) : roots;
  };
  return {
    hasEdges: parents.size > 0,
    children: (node) => order(kids.get(node) ?? []),
    parent: (node) => parents.get(node),
    siblings,
    branchLabel: (node) => {
      const p = parents.get(node);
      if (!p) return '';
      const label = labels.get(`${p.getAttribute('data-id')}>${node.getAttribute('data-id')}`);
      if (label) return `Ramura: ${label}`;
      const list = siblings(node);
      return list.length > 1 ? `Ramura ${list.indexOf(node) + 1} din ${list.length}` : '';
    },
  };
}

/**
 * Wires the interaction onto `container` (the element holding the `<svg>`).
 * Returns a cleanup function. Safe to call on containers without a schema.
 */
export interface SchemaInteractionOptions {
  /** Opens the book at a verified step page (`data-page-state="ok"`); without it the page stays plain text. */
  onOpenPage?: (page: string) => void;
}

export function attachSchemaInteraction(container: HTMLElement, options: SchemaInteractionOptions = {}): () => void {
  if (!container.querySelector('.sx-node')) return () => undefined;

  let pinned: Element | null = null;
  const stops = Array.from(container.querySelectorAll('.sx-node'));
  // Roving tabindex: one tab stop for the whole schema, arrows move between steps.
  const setRoving = (active: Element) => {
    stops.forEach((item) => item.setAttribute('tabindex', item === active ? '0' : '-1'));
  };
  setRoving(stops[0]);
  let popover: HTMLElement | null = null;
  // Graph relations from the edge groups; empty => plain DOM order.
  const graph = buildSchemaGraph(container, stops);
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  live.setAttribute('data-sx-live', '');
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
  container.appendChild(live);
  const announce = (node: Element) => {
    live.textContent = graph.branchLabel(node);
  };
  const nextStop = (node: Element, key: string): Element | undefined => {
    const index = stops.indexOf(node);
    if (key === 'Home') return stops[0];
    if (key === 'End') return stops[stops.length - 1];
    if (!graph.hasEdges) {
      return stops[key === 'ArrowRight' || key === 'ArrowDown' ? index + 1 : index - 1];
    }
    if (key === 'ArrowDown') return graph.children(node)[0];
    if (key === 'ArrowUp') return graph.parent(node);
    const siblings = graph.siblings(node);
    const at = siblings.indexOf(node);
    return siblings[key === 'ArrowRight' ? at + 1 : at - 1];
  };

  const nodeOf = (target: EventTarget | null) => (target instanceof Element ? target.closest('.sx-node') : null);

  const closePopover = () => {
    popover?.remove();
    popover = null;
  };

  const unpin = () => {
    pinned = null;
    container.classList.remove(PINNED);
    closePopover();
    applyHighlight(container, null);
  };

  const showPopover = (node: Element) => {
    closePopover();
    const note = node.getAttribute('data-note');
    const page = node.getAttribute('data-page');
    if (!note && !page) return;
    const pop = document.createElement('div');
    pop.className = 'sx-pop';
    pop.setAttribute('role', 'status');
    if (note) pop.appendChild(document.createTextNode(note));
    if (page) {
      const label = `${page.includes('–') ? 'pp.' : 'p.'} ${page}`;
      const verified = node.getAttribute('data-page-state') === 'ok' && options.onOpenPage;
      const row = document.createElement('div');
      row.style.cssText = note ? 'margin-top:6px;' : '';
      if (verified) {
        const open = document.createElement('button');
        open.type = 'button';
        open.setAttribute('data-sx-open-page', page);
        open.textContent = `Deschide în carte, ${label}`;
        open.style.cssText = 'font:inherit;font-weight:700;cursor:pointer;padding:3px 9px;border-radius:999px;border:1px solid var(--sx-line, rgba(128,128,128,0.4));background:transparent;color:inherit;';
        row.appendChild(open);
      } else {
        row.textContent = `Pagina ${page}`;
        row.style.cssText += 'opacity:0.75;font-weight:600;';
      }
      pop.appendChild(row);
    }
    container.appendChild(pop);

    const box = container.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    // The zoom viewer scales its content: convert screen pixels back to local ones.
    const scale = container.offsetWidth ? box.width / container.offsetWidth || 1 : 1;
    const local = (value: number) => value / scale;
    const width = pop.offsetWidth || 220;
    const left = local(rect.left - box.left + rect.width / 2) + container.scrollLeft - width / 2;
    const maxLeft = container.scrollLeft + Math.max(8, local(box.width) - width - 8);
    pop.style.left = `${Math.max(container.scrollLeft + 8, Math.min(left, maxLeft))}px`;
    pop.style.top = `${local(rect.bottom - box.top) + container.scrollTop + 8}px`;
    popover = pop;
  };

  const pin = (node: Element) => {
    if (pinned === node) {
      unpin();
      return;
    }
    pinned = node;
    container.classList.add(PINNED);
    applyHighlight(container, node);
    showPopover(node);
  };

  const onOver = (event: Event) => {
    if (pinned) return;
    const node = nodeOf(event.target);
    if (node) applyHighlight(container, node);
  };
  const onOut = (event: Event) => {
    if (pinned) return;
    const related = (event as MouseEvent).relatedTarget;
    if (nodeOf(related)) return;
    applyHighlight(container, null);
  };
  const onFocusIn = (event: Event) => {
    const node = nodeOf(event.target);
    if (node && stops.includes(node)) setRoving(node);
    if (pinned) return;
    if (node) applyHighlight(container, node);
  };
  const onFocusOut = (event: Event) => {
    if (pinned) return;
    if (nodeOf((event as FocusEvent).relatedTarget)) return;
    applyHighlight(container, null);
  };

  const onClick = (event: Event) => {
    if (event.target instanceof Element && event.target.closest('.sx-pop')) {
      event.stopPropagation();
      const open = event.target.closest('[data-sx-open-page]');
      const page = open?.getAttribute('data-sx-open-page');
      if (page) options.onOpenPage?.(page);
      return;
    }
    const node = nodeOf(event.target);
    if (node) {
      // A node click belongs to the schema: it must not also open the zoom viewer.
      event.stopPropagation();
      pin(node);
      return;
    }
    if (pinned) {
      event.stopPropagation();
      unpin();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && pinned) {
      event.stopPropagation();
      unpin();
      return;
    }
    const node = nodeOf(event.target);
    if (!node) return;
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const target = nextStop(node, event.key);
      event.preventDefault();
      event.stopPropagation();
      if (target && target !== node) {
        setRoving(target);
        (target as HTMLElement).focus();
        announce(target);
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      pin(node);
    }
  };

  container.addEventListener('mouseover', onOver);
  container.addEventListener('mouseout', onOut);
  container.addEventListener('focusin', onFocusIn);
  container.addEventListener('focusout', onFocusOut);
  container.addEventListener('click', onClick);
  container.addEventListener('keydown', onKeyDown);

  return () => {
    container.removeEventListener('mouseover', onOver);
    container.removeEventListener('mouseout', onOut);
    container.removeEventListener('focusin', onFocusIn);
    container.removeEventListener('focusout', onFocusOut);
    container.removeEventListener('click', onClick);
    container.removeEventListener('keydown', onKeyDown);
    closePopover();
    live.remove();
    applyHighlight(container, null);
    container.classList.remove(PINNED);
    stops.forEach((item) => item.setAttribute('tabindex', '0'));
  };
}
