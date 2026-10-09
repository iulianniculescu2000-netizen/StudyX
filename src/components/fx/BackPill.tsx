import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * "Back" as a small glass pill: it floats over the page, the arrow leans out on hover and it
 * presses in when clicked. Styles live in index.css (.back-pill), so motion is switched off there
 * for low-power mode and reduced motion.
 */
export default function BackPill({ to, label, className = '' }: { to: string; label: string; className?: string }) {
  return (
    <Link to={to} className={`back-pill fx-rise ${className}`}>
      <ChevronLeft size={16} strokeWidth={2.4} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
