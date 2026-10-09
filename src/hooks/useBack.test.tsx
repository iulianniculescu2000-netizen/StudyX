import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useBack } from './useBack';

function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }
function Page() {
  const back = useBack('/fallback');
  const navigate = useNavigate();
  return <><button onClick={back}>back</button><button onClick={() => navigate('/next')}>next</button><Where /></>;
}
const app = (entries: Array<string | { pathname: string; state?: unknown }>) => (
  <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
    <Routes><Route path="*" element={<Page />} /></Routes>
  </MemoryRouter>
);

describe('useBack', () => {
  it('se întoarce în istoric când există intrare anterioară', () => {
    render(app(['/a', '/b']));
    act(() => screen.getByText('back').click());
    expect(screen.getByTestId('where').textContent).toBe('/a');
  });
  it('folosește state.from când nu e istoric', () => {
    render(app([{ pathname: '/b', state: { from: '/origine?x=1' } }]));
    act(() => screen.getByText('back').click());
    expect(screen.getByTestId('where').textContent).toBe('/origine');
  });
  it('cade pe fallback fără istoric și fără from', () => {
    render(app(['/b']));
    act(() => screen.getByText('back').click());
    expect(screen.getByTestId('where').textContent).toBe('/fallback');
  });
});
