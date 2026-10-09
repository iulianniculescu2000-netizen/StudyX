import PageHeader from '../ui/PageHeader';

interface AIGamificationHeaderProps {
  username: string;
}

export default function AIGamificationHeader({ username }: AIGamificationHeaderProps) {
  const name = username.trim();
  return (
    <PageHeader
      title="Realizări"
      help="page-gamification"
      subtitle={name ? `Progres calculat din sesiunile tale, ${name}` : 'Progres calculat din sesiunile tale'}
    />
  );
}
