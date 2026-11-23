import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import NavItem from './NavItem';

const wrap = (node: React.ReactNode, initialPath = '/') =>
  render(<MemoryRouter initialEntries={[initialPath]}><ThemeProvider>{node}</ThemeProvider></MemoryRouter>);
const item = (props: Partial<React.ComponentProps<typeof NavItem>>) => (
  <NavItem to="/review" icon={<span />} label="Recapitulare" collapsed {...props} />
);

describe('NavItem', () => {
  it('restrâns, eticheta conține și insigna vizibilă, ca comenzile vocale să potrivească ce se vede', () => {
    wrap(item({ badge: 15 }));
    expect(screen.getByRole('link').getAttribute('aria-label')).toBe('Recapitulare, 15');
  });

  it('restrâns și fără insignă, eticheta e doar numele', () => {
    wrap(item({}));
    expect(screen.getByRole('link').getAttribute('aria-label')).toBe('Recapitulare');
  });

  it('extins, numele vizibil e deja eticheta: nu pune aria-label', () => {
    wrap(item({ collapsed: false, badge: 15 }));
    expect(screen.getByRole('link').getAttribute('aria-label')).toBeNull();
  });

  it('restrâns și activ, link-ul <a> deține direct cutia 44×44 fără copil div intermediar și cu straturi decorative non-interactive', () => {
    wrap(item({}), '/review');
    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.className).toContain('w-11');
    expect(link.className).toContain('h-11');
    expect(link.querySelector(':scope > div')).toBeNull();
    const decorative = link.querySelectorAll('[aria-hidden="true"]');
    expect(decorative.length).toBeGreaterThanOrEqual(2);
    for (const el of decorative) {
      expect(el.className).toContain('pointer-events-none');
    }
  });
});
