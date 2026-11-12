import DOMPurify from 'dompurify';

/**
 * Every piece of HTML/SVG that reaches `dangerouslySetInnerHTML` in the chat
 * goes through here: mermaid output and the built-in schema renderer. Model
 * markdown itself never becomes raw HTML (react-markdown builds React nodes).
 */

let purifier: ReturnType<typeof DOMPurify> | null = null;

/** Decodes CSS escapes and drops comments so hex-escaped or comment-split url( cannot hide a load. */
function normalizeCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '')
    .replace(/[\\]([0-9a-f]{1,6})[ \t\r\n\f]?/gi, (_m, hex: string) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/[\\]([^\n])/g, '$1');
}

/** True when a url(...) argument points anywhere but the diagram itself. */
function nonLocalUrl(arg: string): boolean {
  return !arg.trim().replace(/^['"]\s*/, '').startsWith('#');
}

/** Strict CSS cleanup for `<style>` blocks and `style` attributes. */
export function cleanCss(raw: string): string {
  let css = normalizeCss(raw);
  css = css.replace(/@(?:import|namespace|charset)\b[^;{}]*;?/gi, '');
  css = css.replace(/url\(\s*([^)]*)\)/gi, (m, arg: string) => (nonLocalUrl(arg) ? 'none' : m));
  css = css.replace(/(?:image-set|-webkit-image-set|image|src|cross-fade|element)\(/gi, 'none(');
  css = css.replace(/[^;{}]*(?:expression\s*\(|behaviou?r\s*:|-moz-binding|javascript:)[^;}]*;?/gi, '');
  return css;
}

function getPurifier() {
  if (purifier) return purifier;
  const instance = DOMPurify(window);
  instance.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style') node.textContent = cleanCss(node.textContent ?? '');
  });
  instance.addHook('uponSanitizeAttribute', (_node, data) => {
    const name = data.attrName;
    // Links inside a diagram may only point at the diagram itself (`<use href="#x">`).
    if ((name === 'href' || name === 'xlink:href') && !data.attrValue.trim().startsWith('#')) {
      data.keepAttr = false;
      return;
    }
    if (name === 'style') {
      data.attrValue = cleanCss(data.attrValue);
      return;
    }
    // Presentation attributes (fill="url(...)", filter, clip-path, mask...).
    if (/url\s*\(/i.test(normalizeCss(data.attrValue))) {
      const bad = [...normalizeCss(data.attrValue).matchAll(/url\(\s*([^)]*)\)/gi)].some((m) => nonLocalUrl(m[1]));
      if (bad) data.keepAttr = false;
    }
  });
  purifier = instance;
  return instance;
}

/** Last line of defence on the serialised output. */
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
