import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import TopicProgressCard from './TopicProgressCard';
import { expectNoA11yViolations } from '../../test/a11y';

const wrap = (node: React.ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

describe('TopicProgressCard', () => {
  it('arată înainte → după și diferența în puncte', () => {
    wrap(<TopicProgressCard delta={{ topic: 'Aritmii', before: 38, after: 54, answeredNow: 5 }} />);
    expect(screen.getByText('Aritmii')).toBeTruthy();
    expect(screen.getByText('54%')).toBeTruthy();
    expect(screen.getByText(/38% →/)).toBeTruthy();
    expect(screen.getByText('+16 puncte față de începutul sesiunii.')).toBeTruthy();
  });

  it('spune cinstit când scorul scade sau nu s-a schimbat', () => {
    const down = wrap(<TopicProgressCard delta={{ topic: 'Aritmii', before: 50, after: 44, answeredNow: 5 }} />);
    expect(screen.getByText('−6 puncte față de începutul sesiunii.')).toBeTruthy();
    down.unmount();
    wrap(<TopicProgressCard delta={{ topic: 'Aritmii', before: 40, after: 40, answeredNow: 5 }} />);
    expect(screen.getByText('Neschimbat față de începutul sesiunii.')).toBeTruthy();
  });

  it('la prima măsurare nu inventează un „înainte”', () => {
    wrap(<TopicProgressCard delta={{ topic: 'Aritmii', before: null, after: 60, answeredNow: 5 }} />);
    expect(screen.getByText('Prima măsurare pe acest subiect.')).toBeTruthy();
    expect(screen.queryByText(/→/)).toBeNull();
  });

  it('nu are probleme de accesibilitate (axe)', async () => {
    const { container } = wrap(<TopicProgressCard delta={{ topic: 'Aritmii', before: 38, after: 54, answeredNow: 5 }} />);
    await expectNoA11yViolations(container);
  }, 30_000);
});
