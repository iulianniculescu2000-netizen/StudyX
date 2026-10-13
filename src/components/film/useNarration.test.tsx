import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNarration } from './useNarration';

function Narration({ scene = 'intro', elapsed = 0, running = true, sound = false }) {
  const { audioRef, unavailable } = useNarration(scene, elapsed, running, sound);
  return <><audio ref={audioRef} /><output>{unavailable ? 'captions' : 'ready'}</output></>;
}

describe('optional local narration', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(1);
    vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(7.08);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('never loads or plays automatically; opt-in seeks to the shared clock', () => {
    const view = render(<Narration elapsed={2200} />);
    const audio = view.container.querySelector('audio')!;
    expect(audio.hasAttribute('src')).toBe(false);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    view.rerender(<Narration elapsed={2200} sound />);
    expect(audio.getAttribute('src')).toMatch(/audio\/intro\/intro\.mp3$/);
    expect(audio.currentTime).toBe(2.2);
    expect(audio.muted).toBe(false);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    view.rerender(<Narration elapsed={2500} sound running={false} />);
    expect(audio.currentTime).toBe(2.5);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    view.rerender(<Narration elapsed={2500} sound />);
    expect(audio.currentTime).toBe(2.5);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it('switches files on scene navigation and corrects playback drift', () => {
    const view = render(<Narration sound elapsed={1000} />);
    const audio = view.container.querySelector('audio')!;
    audio.currentTime = 0;
    view.rerender(<Narration sound elapsed={1600} />);
    expect(audio.currentTime).toBe(1.6);
    view.rerender(<Narration scene="quiz" sound elapsed={0} />);
    expect(audio.getAttribute('src')).toMatch(/quiz\.mp3$/);
    expect(audio.currentTime).toBe(0);
    view.rerender(<Narration scene="quiz" elapsed={0} />);
    expect(audio.muted).toBe(true);
    expect(audio.hasAttribute('src')).toBe(false);
  });

  it('handles missing files and rejected playback without stopping captions', async () => {
    const view = render(<Narration sound />);
    fireEvent.error(view.container.querySelector('audio')!);
    expect(view.container.querySelector('output')?.textContent).toBe('captions');
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('blocked'));
    await act(async () => view.rerender(<Narration scene="quiz" sound />));
    expect(view.container.querySelector('output')?.textContent).toBe('captions');
  });

  it('waits for metadata before seeking and does not restart audio in the final hold', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(0);
    const view = render(<Narration sound elapsed={2000} />);
    const audio = view.container.querySelector('audio')!;
    expect(audio.preload).toBe('auto');
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.loadedMetadata(audio);
    expect(audio.currentTime).toBe(2);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    view.rerender(<Narration sound elapsed={7230} running={false} />);
    view.rerender(<Narration sound elapsed={7230} />);
    fireEvent.loadedMetadata(audio);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });
});
