import { useEffect } from 'react';
import { useLocation as useRouterLocation } from 'react-router-dom';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';

function getQuizId(path: string, segment: number) {
  return path.split('/')[segment] ?? '';
}

export default function TitleManager() {
  const location = useRouterLocation();
  const { quizzes } = useQuizStore();
  const { streak } = useStatsStore();

  useEffect(() => {
    let title = 'StudyX';
    let icon = '\u26A1';
    const path = location.pathname;
    const searchParams = new URLSearchParams(location.search);

    if (path === '/') {
      title = 'StudyX - Panou';
      icon = '\u2302';
    } else if (path === '/quizzes') {
      title = 'StudyX - Grilele Mele';
      icon = '\u{1F4DA}';
    } else if (path === '/create') {
      title = searchParams.has('edit') ? 'StudyX - Editare grilă' : 'StudyX - Grilă nouă';
      icon = '\u{1F4DD}';
    } else if (path.startsWith('/quiz/')) {
      const quiz = quizzes.find((item) => item.id === getQuizId(path, 2));
      title = quiz ? `StudyX - ${quiz.title}` : 'StudyX - Detalii grilă';
      icon = '\u{1F4DD}';
    } else if (path.startsWith('/play/')) {
      const quiz = quizzes.find((item) => item.id === getQuizId(path, 2));
      title = quiz ? `Rezolvă - ${quiz.title}` : 'StudyX - Rezolvă';
      icon = '\u{1F9E0}';
    } else if (path.startsWith('/results/')) {
      const quiz = quizzes.find((item) => item.id === getQuizId(path, 2));
      title = quiz ? `Rezultate - ${quiz.title}` : 'StudyX - Rezultate';
      icon = '\u{1F3C6}';
    } else if (path === '/review') {
      title = 'StudyX - Recapitulare';
      icon = '\u{1F504}';
    } else if (path === '/daily-review') {
      title = 'StudyX - Sesiune zilnică';
      icon = '\u{1F525}';
    } else if (path === '/stats') {
      title = 'StudyX - Statistici';
      icon = '\u{1F4CA}';
    } else if (path === '/vault') {
      title = 'StudyX - Biblioteca AI';
      icon = '\u{1F3DB}\uFE0F';
    } else if (path === '/flashcards') {
      title = 'StudyX - Flashcarduri';
      icon = '\u{1F0CF}';
    } else if (path.startsWith('/flashcards/session/')) {
      const quiz = quizzes.find((item) => item.id === getQuizId(path, 3));
      title = quiz ? `Flashcarduri - ${quiz.title}` : 'StudyX - Sesiune flashcard';
      icon = '\u{1F0CF}';
    } else if (path === '/notes') {
      title = 'StudyX - Notițe';
      icon = '\u{1F5D2}\uFE0F';
    } else if (path === '/rezidentiat/flashcarduri') {
      title = 'StudyX - Flashcarduri Rezidențiat';
      icon = '\u{1F0CF}';
    } else if (path === '/rezidentiat/organizare') {
      title = 'StudyX - Organizare';
      icon = '\u{1F5C2}️';
    } else if (path === '/rezidentiat' || path.startsWith('/rezidentiat/')) {
      title = 'StudyX - Rezidențiat';
      icon = '\u{1FA7A}';
    } else if (path === '/gamification') {
      title = 'StudyX - Realizări';
      icon = '\u{1F3C6}';
    } else if (path === '/analytics') {
      title = 'StudyX - Perspective AI';
      icon = '\u{1F52E}';
    } else if (path === '/settings') {
      title = 'StudyX - Setări';
      icon = '\u2699\uFE0F';
    }

    if (streak.currentStreak >= 3) icon = '\u{1F525}';

    document.title = title;

    const canvas = document.createElement('canvas');
    canvas.height = 64;
    canvas.width = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0F0F12';
      const radius = 14;
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(64 - radius, 0);
      ctx.quadraticCurveTo(64, 0, 64, radius);
      ctx.lineTo(64, 64 - radius);
      ctx.quadraticCurveTo(64, 64, 64 - radius, 64);
      ctx.lineTo(radius, 64);
      ctx.quadraticCurveTo(0, 64, 0, 64 - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.fill();

      ctx.font = '42px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, 32, 35);

      const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'shortcut icon';
      link.href = canvas.toDataURL();
      document.getElementsByTagName('head')[0].appendChild(link);
    }
  }, [location.pathname, location.search, quizzes, streak.currentStreak]);

  return null;
}
