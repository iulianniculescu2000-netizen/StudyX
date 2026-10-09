import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ChatMemoryPanel from './ChatMemoryPanel';
import { ThemeProvider } from '../../theme/ThemeContext';
import { addMemoryManually, isMemoryEnabled, loadMemories } from '../../ai/chatMemory';

function renderPanel() {
  return render(
    <ThemeProvider>
      <ChatMemoryPanel profileId="p1" />
    </ThemeProvider>,
  );
}

describe('ChatMemoryPanel', () => {
  beforeEach(() => localStorage.clear());

  it('shows the empty state, then lets the student add a memory', () => {
    renderPanel();
    expect(screen.getByText(/Încă nu am reținut nimic/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/Adaugă ceva ce ar trebui să știe/), { target: { value: 'Am examenul în iulie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă' }));

    expect(screen.getByText('Am examenul în iulie')).toBeTruthy();
    expect(loadMemories('p1')).toHaveLength(1);
  });

  it('pins, edits and deletes stored entries', () => {
    addMemoryManually('p1', 'preference', 'Preferă scheme și tabele');
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Fixează' }));
    expect(loadMemories('p1')[0].pinned).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Editează' }));
    fireEvent.change(screen.getByDisplayValue('Preferă scheme și tabele'), { target: { value: 'Preferă doar scheme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(loadMemories('p1')[0].text).toBe('Preferă doar scheme');

    fireEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    expect(loadMemories('p1')).toHaveLength(0);
  });

  it('switches conversational memory off and on', () => {
    renderPanel();
    const toggle = screen.getByRole('switch');
    expect(isMemoryEnabled()).toBe(true);
    fireEvent.click(toggle);
    expect(isMemoryEnabled()).toBe(false);
    fireEvent.click(toggle);
    expect(isMemoryEnabled()).toBe(true);
  });

  it('asks for confirmation before wiping everything', () => {
    addMemoryManually('p1', 'goal', 'Se pregătește pentru rezidențiat');
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Șterge tot/ }));
    expect(loadMemories('p1')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Da, șterge/ }));
    expect(loadMemories('p1')).toHaveLength(0);
  });
});
