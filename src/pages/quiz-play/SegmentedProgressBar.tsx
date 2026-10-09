interface Segment {
  done: boolean;
  current: boolean;
}

/**
 * One segment per question — mobile-only alternative to the continuous
 * "Progres sesiune" bar in the hero. Sits on the same white-on-gradient hero
 * background, so it uses white/translucent tones directly rather than theme
 * tokens (matching the sibling hero elements, not the page's own palette).
 */
export default function SegmentedProgressBar({ segments }: { segments: Segment[] }) {
  return (
    <div className="flex items-center gap-1">
      {segments.map((seg, i) => (
        <div
          key={i}
          className="h-1.5 flex-1 rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.18)' }}
        >
          <div
            className="h-full w-full rounded-full transition-transform [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-standard)]"
            style={{
              transform: `translateX(${seg.done || seg.current ? 0 : -100}%)`,
              background: seg.current
                ? 'linear-gradient(90deg, rgba(255,255,255,0.98), rgba(255,255,255,0.62))'
                : 'rgba(255,255,255,0.9)',
            }}
          />
        </div>
      ))}
    </div>
  );
}
