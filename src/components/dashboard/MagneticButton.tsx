import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dur, spring } from '../../theme/motion';

export default function MagneticButton({
  children,
  className,
  style,
  to,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  to?: string;
}) {
  const { calmMotion } = useAdaptiveMotion();
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouse = (e: React.MouseEvent) => {
    if (calmMotion) return;
    const { clientX, clientY, currentTarget } = e;
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    const x = (clientX - (left + width / 2)) * 0.22;
    const y = (clientY - (top + height / 2)) * 0.22;
    setPosition({ x, y });
  };

  const reset = () => setPosition({ x: 0, y: 0 });

  const content = (
    <motion.div
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      animate={calmMotion ? undefined : { x: position.x, y: position.y }}
      transition={calmMotion ? { duration: dur.instant } : spring.nav}
      className={`btn-action ${className ?? ''}`}
      style={style}
    >
      {children}
    </motion.div>
  );

  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{content}</Link> : content;
}
