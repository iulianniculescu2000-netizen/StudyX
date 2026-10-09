import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import HelpTip from './HelpTip';
import { HELP_TIPS } from '../../tutorial/helpTips';

function wrap(node: React.ReactNode) {
  return render(<MemoryRouter><ThemeProvider>{node}</ThemeProvider></MemoryRouter>);
}

const labelFor = (id: keyof typeof HELP_TIPS) => `Ajutor: ${HELP_TIPS[id].title}`;

describe('HelpTip', () => {
  it('se deschide la click și arată titlul și textul, cu aria corecte', () => {
    wrap(<HelpTip id="fc-new-folder" />);
    const button = screen.getByRole('button', { name: labelFor('fc-new-folder') });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const dialog = screen.getByRole('dialog');
    expect(button.getAttribute('aria-controls')).toBe(dialog.id);
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(screen.getByRole('heading', { name: HELP_TIPS['fc-new-folder'].title })).toBeTruthy();
    expect(screen.getByText(HELP_TIPS['fc-new-folder'].body)).toBeTruthy();
  });

  it('se închide la al doilea click și cu Esc', () => {
    wrap(<HelpTip id="fc-new-folder" />);
    const button = screen.getByRole('button', { name: labelFor('fc-new-folder') });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('se închide la click în afară', () => {
    wrap(<><HelpTip id="fc-new-folder" /><p>afară</p></>);
    fireEvent.click(screen.getByRole('button', { name: labelFor('fc-new-folder') }));
    fireEvent.pointerDown(screen.getByText('afară'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('un singur indiciu deschis la un moment dat', () => {
    wrap(<><HelpTip id="fc-new-folder" /><HelpTip id="rez-ai-level" /></>);
    fireEvent.click(screen.getByRole('button', { name: labelFor('fc-new-folder') }));
    fireEvent.click(screen.getByRole('button', { name: labelFor('rez-ai-level') }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: HELP_TIPS['rez-ai-level'].title })).toBeTruthy();
  });

  it('„Ghid pas cu pas” apare doar când există un tur', () => {
    wrap(<><HelpTip id="fc-new-folder" /><HelpTip id="rez-ai-level" /></>);
    fireEvent.click(screen.getByRole('button', { name: labelFor('fc-new-folder') }));
    expect(screen.getByRole('button', { name: 'Ghid pas cu pas' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: labelFor('rez-ai-level') }));
    expect(screen.queryByRole('button', { name: 'Ghid pas cu pas' })).toBeNull();
  });
});
