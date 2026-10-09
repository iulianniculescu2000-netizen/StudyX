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

/**
 * Wires the interaction onto `container` (the element holding the `<svg>`).
 * Returns a cleanup function. Safe to call on containers without a schema.
 */
export function attachSchemaInteraction(container: HTMLElement): () => void {
  if (!container.querySelector('.sx-node')) return () => undefined;

  let pinned: Element | null = null;
  let popover: HTMLElement | null = null;

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
    if (!note) return;
    const pop = document.createElement('div');
    pop.className = 'sx-pop';
    pop.setAttribute('role', 'status');
    pop.textContent = note;
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
    if (pinned) return;
    const node = nodeOf(event.target);
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
    applyHighlight(container, null);
    container.classList.remove(PINNED);
  };
}
