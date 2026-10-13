import { useEffect, useRef, useState } from 'react';
import { audioPath } from './narration';

/** Audio follows the visual clock; it never advances a scene or starts by itself. */
export function useNarration(sceneId: string, elapsedMs: number, running: boolean, sound: boolean) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [failedScene, setFailedScene] = useState<string | null>(null);
  const elapsedRef = useRef(elapsedMs);
  useEffect(() => { elapsedRef.current = elapsedMs; }, [elapsedMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !sound) return;
    audio.src = audioPath(sceneId);
    // The dialog deliberately uses preload="none" while muted. Once opted in,
    // explicitly load: waiting for metadata before play() otherwise deadlocks.
    audio.preload = 'auto';
    let alive = true;
    const fail = () => { if (alive) setFailedScene(sceneId); };
    audio.addEventListener('error', fail);
    audio.load();
    return () => { alive = false; audio.pause(); audio.removeEventListener('error', fail); audio.removeAttribute('src'); audio.load(); };
  }, [sceneId, sound]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !sound;
    if (!sound || !running || failedScene === sceneId) { audio.pause(); return; }
    let alive = true;
    const play = () => {
      if (!alive) return;
      const seconds = elapsedRef.current / 1000;
      if (Number.isFinite(audio.duration) && seconds >= audio.duration) { audio.pause(); return; }
      audio.currentTime = seconds;
      const result = audio.play();
      result?.catch(() => { if (alive) setFailedScene(sceneId); });
    };
    if (audio.readyState >= 1) play();
    else audio.addEventListener('loadedmetadata', play);
    return () => { alive = false; audio.removeEventListener('loadedmetadata', play); audio.pause(); };
  }, [failedScene, running, sceneId, sound]);

  // Correct drift and manual seeks without repeatedly invoking play().
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !sound || audio.readyState < 1 || failedScene === sceneId) return;
    const seconds = elapsedMs / 1000;
    if (Number.isFinite(audio.duration) && seconds >= audio.duration) { audio.pause(); return; }
    if (Math.abs(audio.currentTime - seconds) > 0.25) audio.currentTime = seconds;
  }, [elapsedMs, failedScene, sceneId, sound]);

  return { audioRef, unavailable: sound && failedScene === sceneId };
}
