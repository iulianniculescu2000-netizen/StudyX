import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import TitleManager from './TitleManager';

function titleFor(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <TitleManager />
    </MemoryRouter>,
  );
  return document.title;
}

describe('TitleManager', () => {
  it.each([
    ['/rezidentiat', 'StudyX - Rezidențiat'],
    ['/rezidentiat/organizare', 'StudyX - Organizare'],
    ['/rezidentiat/abc123', 'StudyX - Rezidențiat'],
    ['/gamification', 'StudyX - Realizări'],
    ['/analytics', 'StudyX - Perspective AI'],
    ['/erori', 'StudyX - Caiet de erori'],
    ['/simulare', 'StudyX - Simulare de examen'],
    ['/aproape-examen', 'StudyX - Aproape de examen'],
    ['/folder/inexistent', 'StudyX - Folder'],
  ])('%s -> %s', (path, expected) => {
    expect(titleFor(path)).toBe(expected);
  });
});
