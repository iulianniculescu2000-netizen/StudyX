/** Static depth: no independent animation, timers, filters or playback work. */
export default function FilmAtmosphere() {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden"
    style={{ background: 'radial-gradient(ellipse at 50% 36%, #17395d 0%, #0d1c31 40%, #080f1b 76%)' }}>
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 880 660" preserveAspectRatio="xMidYMid slice" fill="none">
      <g stroke="#7eb4ff" strokeOpacity="0.045" transform="rotate(-8 440 280)">
        {[0, 1, 2, 3, 4, 5, 6].map((ring) => <ellipse key={ring} cx="440" cy="280" rx={180 + ring * 48} ry={80 + ring * 23} />)}
      </g>
      <g fill="#9bcaff" fillOpacity="0.2">{Array.from({ length: 18 }, (_, index) =>
        <circle key={index} cx={40 + (index * 173) % 800} cy={100 + (index * 97) % 440} r={index % 3 === 0 ? 1.2 : 0.7} />)}</g>
    </svg>
  </div>;
}
