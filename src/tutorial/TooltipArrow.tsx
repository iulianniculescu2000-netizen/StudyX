import { useTheme } from '../theme/ThemeContext';

export default function TooltipArrow({ position }: { position: string }) {
  const theme = useTheme();
  if (position === 'center') return null;
  const styles: Record<string, React.CSSProperties> = {
    right: { left: -8, top: '50%', transform: 'translateY(-50%)', borderRight: `8px solid ${theme.modalBg}`, borderTop: '8px solid transparent', borderBottom: '8px solid transparent' },
    left: { right: -8, top: '50%', transform: 'translateY(-50%)', borderLeft: `8px solid ${theme.modalBg}`, borderTop: '8px solid transparent', borderBottom: '8px solid transparent' },
    bottom: { top: -8, left: '50%', transform: 'translateX(-50%)', borderBottom: `8px solid ${theme.modalBg}`, borderLeft: '8px solid transparent', borderRight: '8px solid transparent' },
    top: { bottom: -8, left: '50%', transform: 'translateX(-50%)', borderTop: `8px solid ${theme.modalBg}`, borderLeft: '8px solid transparent', borderRight: '8px solid transparent' },
  };
  return <div style={{ position: 'absolute', width: 0, height: 0, ...styles[position] }} />;
}
