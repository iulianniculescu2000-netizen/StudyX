import { Database, Layers3, Plus, Search } from 'lucide-react';
import type { TourDefinition } from '../types';

export const vaultTour: TourDefinition = {
  id: 'vault',
  title: 'Biblioteca AI',
  autoStartRoute: '/vault',
  steps: [
    {
      id: 'vault-intro',
      title: 'Biblioteca AI',
      body: 'Aici stau cursurile și cărțile din care lucrează AI-ul. Cât timp un document se indexează, el nu poate fi folosit încă. Un tur scurt, în patru pași.',
      icon: <Database size={22} />,
      placement: 'center',
      route: '/vault',
      accent: '#64D2FF',
    },
    {
      id: 'vault-add',
      title: 'Adaugă un document',
      body: 'PDF, DOCX, text sau poze. După încărcare, documentul se indexează; când apare gata, AI-ul îl poate folosi.',
      icon: <Plus size={22} />,
      target: '[data-tutorial="vault-add"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/vault',
      accent: '#0A84FF',
    },
    {
      id: 'vault-search',
      title: 'Caută în tot ce ai adăugat',
      body: 'Căutarea ignoră diacriticele, deci „sarcina” găsește și „sarcină”. Într-un folder poți filtra după tip.',
      icon: <Search size={22} />,
      target: '[data-tutorial="vault-search"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/vault',
    },
    {
      id: 'vault-studio',
      title: 'AI Studio',
      body: 'Alegi un document sau un capitol și generezi grile din el. Ajung în folderul ales, iar cele pentru Rezidențiat în Grile › specialitate.',
      icon: <Layers3 size={22} />,
      target: '[data-tutorial="vault-studio"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/vault',
      accent: '#BF6FFF',
    },
  ],
};
