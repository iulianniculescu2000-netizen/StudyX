import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUserStore } from '../../store/userStore';
import { useAIStore } from '../../store/aiStore';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';

describe('App Boot Smoke Tests', () => {
  beforeEach(() => {
    // Reset all stores before each test
    useUserStore.getState().reset();
    useAIStore.getState().reset();
    useQuizStore.getState().reset();
    useStatsStore.getState().reset();
  });

  it('should hydrate user store without crashing', () => {
    const { result } = renderHook(() => useUserStore());
    
    expect(result.current.profiles).toEqual([]);
    expect(result.current.activeProfileId).toBeNull();
    expect(result.current.username).toBeNull();
  });

  it('should handle AI store hydration', () => {
    const { result } = renderHook(() => useAIStore());
    
    expect(result.current.apiKey).toBe('');
    expect(result.current.model).toBe('openai/gpt-oss-120b');
    expect(result.current.knowledgeSources).toEqual([]);
    expect(typeof result.current.isHydrated).toBe('boolean');
  });

  it('should initialize quiz store safely', () => {
    const { result } = renderHook(() => useQuizStore());
    
    expect(result.current.quizzes).toEqual([]);
    expect(result.current.sessions).toEqual([]);
  });

  it('should handle stats store initialization', () => {
    const { result } = renderHook(() => useStatsStore());
    
    expect(result.current.questionStats).toEqual({});
    expect(result.current.streak).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: '',
      studyDates: []
    });
    expect(result.current.totalStudyTime).toBe(0);
  });

  it('should create profile without errors', () => {
    const { result: userResult } = renderHook(() => useUserStore());

    let profileId = '';
    act(() => {
      profileId = userResult.current.addProfile('Test User');
      userResult.current.switchProfile(profileId);
    });
    
    expect(userResult.current.profiles).toHaveLength(1);
    expect(userResult.current.profiles[0].username).toBe('Test User');
    expect(userResult.current.activeProfileId).toBe(profileId);
  });

  it('should handle AI settings persistence', () => {
    const { result: aiResult } = renderHook(() => useAIStore());
    
    act(() => {
      aiResult.current.setApiKey('test-api-key');
      aiResult.current.setModel('openai/gpt-oss-20b');
    });

    expect(aiResult.current.apiKey).toBe('test-api-key');
    expect(aiResult.current.model).toBe('openai/gpt-oss-20b');
  });

  it('should handle quiz creation safely', () => {
    const { result: quizResult } = renderHook(() => useQuizStore());
    
    const testQuiz = {
      id: 'test-quiz',
      title: 'Test Quiz',
      description: 'Test Description',
      emoji: '🧪',
      category: 'Test',
      color: 'blue' as const,
      questions: [],
      createdAt: Date.now(),
      shuffleQuestions: false,
      shuffleAnswers: false,
      penaltyMode: false,
    };
    
    act(() => {
      quizResult.current.addQuiz(testQuiz);
    });
    
    expect(quizResult.current.quizzes).toHaveLength(1);
    expect(quizResult.current.quizzes[0].title).toBe('Test Quiz');
  });
});
