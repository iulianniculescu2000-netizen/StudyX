import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AIRichText from './AIRichText';
import { ThemeProvider } from '../../theme/ThemeContext';

describe('AIRichText', () => {
  it('arată ș și ț cu virgulă chiar când modelul le scrie cu sedilă (și cât se încarcă randarea completă)', () => {
    const { container } = render(<ThemeProvider><AIRichText text={'Performanţa ta: acurateţea şi informaţii despre cardiologie'} /></ThemeProvider>);
    expect(container.textContent).toContain('Performanța ta: acuratețea și informații');
    expect(container.textContent).not.toMatch(/[şţŞŢ]/);
  });
});
