import { plural } from '../../lib/plural';
import { aiStatus } from '../contextText';
import { Bot, Database, LifeBuoy, Settings as SettingsIcon, SlidersHorizontal } from 'lucide-react';
import type { TourDefinition } from '../types';

export const settingsTour: TourDefinition = {
  id: 'settings',
  title: 'Setări',
  steps: [
    {
      id: 'settings-intro',
      title: 'Setările, pe secțiuni',
      body: (ctx) => `Setările se deschid pe secțiunea indicată de ghid. ${ctx.aiReady ? 'Furnizorul AI ales are o cheie salvată.' : 'Furnizorul AI ales nu este configurat încă.'} La Date poți exporta un backup.`,
      icon: <SettingsIcon size={22} />,
      placement: 'center',
      route: '/settings?s=aspect',
      accent: '#0A84FF',
    },
    {
      id: 'settings-tabs',
      title: 'Aspect, performanță, date, AI, ajutor',
      body: 'Aspectul alege tema luminoasă, cea întunecată sau automată. Performanța are „Mod economisire” pentru calculatoare mai slabe. Zona periculoasă e ultima, ca să nu o atingi din greșeală.',
      icon: <SlidersHorizontal size={22} />,
      target: '[data-tutorial="settings-tabs"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/settings?s=aspect',
    },
    {
      id: 'settings-backup',
      title: 'Backup pentru datele tale',
      body: '„Gestionare Date” exportă tot progresul într-un fișier și îl poate importa înapoi. Un backup făcut din când în când te scutește de griji la o reinstalare.',
      icon: <Database size={22} />,
      target: '[data-tutorial="settings-backup"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/settings?s=date',
      accent: '#30D158',
    },
    {
      id: 'settings-ai',
      title: 'Asistentul AI',
      body: (ctx) => `${aiStatus(ctx)} Ai ${plural(ctx.aiKeyCount, 'furnizor cu cheie salvată', 'furnizori cu chei salvate')}. Selectează furnizorul și modelul; o cheie salvată nu garantează că serviciul acceptă cererea.`,
      icon: <Bot size={22} />,
      target: '[data-tutorial="settings-ai"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/settings?s=ai',
      accent: '#BF6FFF',
    },
    {
      id: 'settings-help',
      title: 'Filmul și ghidurile',
      body: 'La „Ajutor și sistem” poți revedea filmul de bun venit și poți porni oricare dintre ghidurile aplicației. Tot de aici cauți actualizări.',
      icon: <LifeBuoy size={22} />,
      target: '[data-tutorial="settings-help"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/settings?s=ajutor',
      accent: '#FF9F0A',
    },
  ],
};
