import { describe, expect, it } from 'vitest';
import { chapterForHeading, chapterForLabel } from './curriculum';

describe('titlul curent din Kumar capitolul 9', () => {
  it('antetul tipărit pe pagini se leagă de capitolul hidro-electrolitic', () => {
    const full = chapterForLabel('Echilibrul hidro-electrolitic și acido-bazic', 'K');
    expect(full).not.toBeNull();
    const running = chapterForHeading('Echilibrul apei, lichidelor şi electroliţilor', 'K');
    expect(running?.index).toBe(full?.index);
  });
});
