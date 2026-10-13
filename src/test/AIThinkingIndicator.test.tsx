import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AIThinkingIndicator, { DEFAULT_THINKING_TEXT } from '../components/ai-chat/AIThinkingIndicator';
import { ThemeProvider } from '../theme/ThemeContext';
import { expectNoA11yViolations } from './a11y';

const wrap = (node: React.ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

describe('AIThinkingIndicator Component', () => {
  it('arată un singur text adevărat, într-un container de stare', () => {
    wrap(<AIThinkingIndicator />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByText(DEFAULT_THINKING_TEXT)).toBeDefined();
  });

  it('nu pretinde pași de raționament pe care aplicația nu îi cunoaște', () => {
    const { container } = wrap(<AIThinkingIndicator />);
    expect(container.textContent).not.toMatch(/Corelez ghidurile|Identific capcanele|Raționament clinic|Model StudyX/);
  });

  it('arată textul fazei când e dat', () => {
    wrap(<AIThinkingIndicator stepText="Verific baremul oficial..." />);
    expect(screen.getByText('Verific baremul oficial...')).toBeDefined();
  });

  it('compact folosește culorile temei, nu un fundal închis fix', () => {
    const { container } = wrap(<AIThinkingIndicator compact stepText="Sintetizez grila..." />);
    expect(screen.getByText('Sintetizez grila...')).toBeDefined();
    expect(container.innerHTML).not.toMatch(/slate-900|slate-950|f472b6|db2777/);
  });

  it('nu are probleme de accesibilitate (axe)', async () => {
    const { container } = wrap(<AIThinkingIndicator compact />);
    await expectNoA11yViolations(container);
  }, 30_000);
});
