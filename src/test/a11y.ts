import axe from 'axe-core';
import { expect, vi } from 'vitest';

/** Reguli care cer layout real: în jsdom ar da rezultate false sau ar bloca rularea. Contrastul se verifică în browser. */
const NEEDS_LAYOUT = ['color-contrast', 'region', 'scrollable-region-focusable', 'target-size', 'link-in-text-block'];

/**
 * Verificare de accesibilitate (axe-core, reguli WCAG A/AA și bune practici) pentru un fragment de DOM randat în jsdom.
 * Eșecul listează regula, elementul și motivul.
 */
export async function expectNoA11yViolations(container: Element) {
  // `setup.ts` pornește timere false pentru toată suita; axe își programează munca cu `setTimeout` și s-ar bloca.
  vi.useRealTimers();
  let violations: axe.Result[];
  try {
    ({ violations } = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      rules: Object.fromEntries(NEEDS_LAYOUT.map((id) => [id, { enabled: false }])),
      iframes: false,
      preload: false,
      resultTypes: ['violations'],
    }));
  } finally {
    vi.useFakeTimers();
  }
  const report = violations.map((violation) => (
    `${violation.id} (${violation.impact}): ${violation.help}\n${violation.nodes.map((node) => `  ${node.html}`).join('\n')}`
  ));
  expect(report, report.join('\n\n')).toEqual([]);
}
