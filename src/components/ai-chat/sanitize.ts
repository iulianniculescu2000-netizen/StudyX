import DOMPurify from 'dompurify';

/**
 * Every piece of HTML/SVG that reaches `dangerouslySetInnerHTML` in the chat
 * goes through here: mermaid output and the built-in schema renderer. Model
 * markdown itself never becomes raw HTML (react-markdown builds React nodes).
 */

let purifier: ReturnType<typeof DOMPurify> | null = null;

function getPurifier() {
  if (purifier) return purifier;
  const instance = DOMPurify(window);
  // Links inside a diagram may only point at the diagram itself (`<use href="#x">`).
  instance.addHook('uponSanitizeAttribute', (_node, data) => {
    if ((data.attrName === 'href' || data.attrName === 'xlink:href') && !data.attrValue.trim().startsWith('#')) {
      data.keepAttr = false;
    }
  });
  purifier = instance;
  return instance;
}

/** Removes remote loads that a theme `<style>` block could still smuggle in. */
function stripRemoteCss(svg: string): string {
  return svg
    .replace(/@import[^;{}]*;?/gi, '')
    .replace(/url\(\s*['"]?\s*(?:https?:)?\/\/[^)]*\)/gi, 'none');
}

export function sanitizeSvg(svg: string): string {
  if (!svg) return '';
  const clean = getPurifier().sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['style', 'use'],
    FORBID_TAGS: ['script', 'foreignObject', 'a', 'iframe', 'object', 'embed', 'image', 'animate', 'set', 'animateTransform'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    ALLOW_DATA_ATTR: true,
  });
  return stripRemoteCss(String(clean));
}
