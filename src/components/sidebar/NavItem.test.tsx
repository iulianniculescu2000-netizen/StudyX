import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import NavItem from './NavItem';

const wrap = (node: React.ReactNode) => render(<MemoryRouter><ThemeProvider>{node}</ThemeProvider></MemoryRouter>);
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
});
