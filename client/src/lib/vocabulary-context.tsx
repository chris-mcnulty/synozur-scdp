import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { VocabularyTerms } from '@shared/schema';
import { DEFAULT_VOCABULARY } from '@shared/schema';

interface VocabularyContextValue {
  epic: string;
  stage: string;
  activity: string;
  workstream: string;
  isLoading: boolean;
}

const VocabularyContext = createContext<VocabularyContextValue>({
  ...DEFAULT_VOCABULARY,
  isLoading: false,
});

interface VocabularyProviderProps {
  children: React.ReactNode;
  projectId?: string;
  clientId?: string;
  estimateId?: string;
}

export function VocabularyProvider({ children, projectId, clientId, estimateId }: VocabularyProviderProps) {
  const [contextKey, setContextKey] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (clientId) params.set('clientId', clientId);
    if (estimateId) params.set('estimateId', estimateId);
    setContextKey(params.toString());
  }, [projectId, clientId, estimateId]);

  const { data, isLoading } = useQuery<Required<VocabularyTerms>>({
    queryKey: ['/api/vocabulary/context', contextKey],
  });

  const value: VocabularyContextValue = {
    epic: data?.epic || DEFAULT_VOCABULARY.epic,
    stage: data?.stage || DEFAULT_VOCABULARY.stage,
    activity: data?.activity || DEFAULT_VOCABULARY.activity,
    workstream: data?.workstream || DEFAULT_VOCABULARY.workstream,
    isLoading,
  };

  return (
    <VocabularyContext.Provider value={value}>
      {children}
    </VocabularyContext.Provider>
  );
}

export function useVocabulary() {
  const context = useContext(VocabularyContext);
  if (!context) {
    throw new Error('useVocabulary must be used within a VocabularyProvider');
  }
  return context;
}
