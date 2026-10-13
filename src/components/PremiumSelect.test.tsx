import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PremiumSelect from './PremiumSelect';
import { ThemeProvider } from '../theme/ThemeContext';
import { launcherCoversControl } from './ai-chat/useLauncherDock';

describe('PremiumSelect', () => {
  afterEach(cleanup);

  it('Esc închide lista și redă focusul butonului; săgețile mută între opțiuni', () => {
    const onChange = vi.fn();
    render(<ThemeProvider><PremiumSelect label="Sortare" value="a" onChange={onChange} options={[{ value: 'a', label: 'Unu' }, { value: 'b', label: 'Doi' }]} /></ThemeProvider>);
    const trigger = screen.getByRole('button', { name: 'Sortare: Unu' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('launcherCoversControl', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('detectează un control sub zona lansatorului AI și ignoră restul', () => {
    document.body.innerHTML = '<main><button id="x">Joacă</button><button id="y">Altul</button></main>';
    const rect = (left: number, top: number) => ({ left, top, right: left + 60, bottom: top + 30, width: 60, height: 30 }) as DOMRect;
    document.getElementById('x')!.getBoundingClientRect = () => rect(950, 700);
    document.getElementById('y')!.getBoundingClientRect = () => rect(100, 100);
    expect(launcherCoversControl(document.body, { width: 1024, height: 768 })).toBe(true);
    document.getElementById('x')!.getBoundingClientRect = () => rect(300, 700);
    expect(launcherCoversControl(document.body, { width: 1024, height: 768 })).toBe(false);
  });
});
