import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './sanitize';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;

describe('sanitizeSvg adversarial', () => {
  it('drops @import in style', () => {
    const out = sanitizeSvg(wrap('<style>@import url(https://evil.test/a.css); .a{fill:red}</style><rect class="a"/>'));
    expect(out).not.toMatch(/@import|evil\.test/i);
    expect(out).toContain('fill');
  });
  it.each([
    ['escape', String.raw`.a{fill:u\72l(https://evil.test/x)}`],
    ['hex escape', String.raw`.a{fill:\75 rl(https://evil.test/x)}`],
    ['comment', '.a{fill:ur/**/l(https://evil.test/x)}'],
    ['uppercase', '.a{fill:URL(HTTPS://evil.test/x)}'],
    ['spaces', ".a{fill:url(  'https://evil.test/x' )}"],
    ['protocol-relative', '.a{fill:url(//evil.test/x)}'],
    ['data', '.a{fill:url(data:image/svg+xml;base64,AAAA)}'],
  ])('neutralises remote url (%s)', (_n, css) => {
    const out = sanitizeSvg(wrap(`<style>${css}</style><rect class="a"/>`));
    expect(out).not.toMatch(/evil\.test|data:image/i);
  });
  it('strips remote url in style attribute and presentation attribute', () => {
    const out = sanitizeSvg(wrap('<rect style="fill:url(https://evil.test/x)" fill="url(https://evil.test/y)"/>'));
    expect(out).not.toContain('evil.test');
  });
  it('removes expression, behavior, -moz-binding', () => {
    const out = sanitizeSvg(wrap('<style>.a{width:expression(alert(1));behavior:url(x.htc);-moz-binding:url(x.xml#y);fill:red}</style><rect class="a"/>'));
    expect(out).not.toMatch(/expression|behavior|-moz-binding/i);
  });
  it('removes external hrefs, foreignObject, handlers, animation on href, javascript:', () => {
    const out = sanitizeSvg(wrap(
      '<use href="https://evil.test/a.svg#x"/><use xlink:href="https://evil.test/b.svg#y" xmlns:xlink="http://www.w3.org/1999/xlink"/>' +
      '<use href="data:image/svg+xml;base64,AAAA"/><foreignObject><div>x</div></foreignObject>' +
      '<rect onload="alert(1)" onclick="alert(2)"/><a href="javascript:alert(1)"><text>t</text></a>' +
      '<rect id="r"><animate attributeName="href" to="https://evil.test"/><set attributeName="href" to="javascript:alert(1)"/></rect>',
    ));
    expect(out).not.toMatch(/evil\.test|foreignObject|onload|onclick|javascript:|<animate|<set|data:image/i);
  });
  it('keeps legitimate diagram features', () => {
    const out = sanitizeSvg(wrap(
      '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient><g id="x"><circle r="1"/></g></defs>' +
      '<style>.n{fill:url(#g);stroke:color-mix(in srgb, var(--sx-ok, #30a46c) 40%, transparent)}</style>' +
      '<rect class="n" fill="url(#g)" data-node="a"/><use href="#x"/>',
    ));
    expect(out).toContain('url(#g)');
    expect(out).toContain('href="#x"');
    expect(out).toContain('data-node="a"');
    expect(out).toContain('color-mix(in srgb');
  });
});
