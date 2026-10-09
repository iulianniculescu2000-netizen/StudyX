import { create } from 'zustand';
import type { Quiz } from '../types';

interface RezidentiatState {
  kumarQuiz: Quiz | null;
  isLoading: boolean;
  error: string | null;
  loadKumarFlashcards: () => Promise<Quiz | null>;
}

export const useRezidentiatStore = create<RezidentiatState>((set, get) => ({
  kumarQuiz: null,
  isLoading: false,
  error: null,
  
  loadKumarFlashcards: async () => {
    if (get().kumarQuiz !== null) return get().kumarQuiz;
    if (get().isLoading) return null;
    
    set({ isLoading: true, error: null });
    
    try {
      const module = await import('../data/rezidentiat/kumar_flashcards.json');
      const data = module.default || module;
      
      set({ kumarQuiz: data as Quiz, isLoading: false });
      return data as Quiz;
    } catch (err: unknown) {
      console.error('Error loading Kumar flashcards:', err);
      set({ error: err instanceof Error ? err.message : 'Failed to load', isLoading: false });
      return null;
    }
  }
}));
