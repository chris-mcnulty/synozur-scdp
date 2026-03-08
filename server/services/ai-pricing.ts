import { AI_MODEL_INFO } from '@shared/schema';

const COST_PER_1K_TOKENS: Record<string, { promptMicrodollars: number; completionMicrodollars: number }> = {
  'gpt-5.4': { promptMicrodollars: 5000, completionMicrodollars: 15000 },
  'gpt-5.2': { promptMicrodollars: 5000, completionMicrodollars: 15000 },
  'gpt-5': { promptMicrodollars: 5000, completionMicrodollars: 15000 },
  'gpt-4o': { promptMicrodollars: 2500, completionMicrodollars: 10000 },
  'gpt-4o-mini': { promptMicrodollars: 150, completionMicrodollars: 600 },
  'gpt-4-turbo': { promptMicrodollars: 10000, completionMicrodollars: 30000 },
  'gpt-4': { promptMicrodollars: 30000, completionMicrodollars: 60000 },
  'claude-sonnet-4': { promptMicrodollars: 3000, completionMicrodollars: 15000 },
  'claude-opus-4': { promptMicrodollars: 15000, completionMicrodollars: 75000 },
  'claude-3.5-sonnet': { promptMicrodollars: 3000, completionMicrodollars: 15000 },
  'claude-3-haiku': { promptMicrodollars: 250, completionMicrodollars: 1250 },
};

const ZERO_COST_PROVIDERS = new Set(['azure_foundry']);

export function calculateEstimatedCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  provider?: string,
): number {
  if (provider && ZERO_COST_PROVIDERS.has(provider)) {
    return 0;
  }

  const pricing = COST_PER_1K_TOKENS[model];
  if (!pricing) {
    const modelInfo = AI_MODEL_INFO[model];
    if (modelInfo) {
      const promptCost = Math.round((promptTokens / 1000) * modelInfo.costPer1kPrompt * 1_000_000);
      const completionCost = Math.round((completionTokens / 1000) * modelInfo.costPer1kCompletion * 1_000_000);
      return promptCost + completionCost;
    }
    return 0;
  }

  const promptCost = Math.round((promptTokens / 1000) * pricing.promptMicrodollars);
  const completionCost = Math.round((completionTokens / 1000) * pricing.completionMicrodollars);
  return promptCost + completionCost;
}

export function formatCostMicrodollars(microdollars: number): string {
  const dollars = microdollars / 1_000_000;
  if (dollars < 0.01) {
    return `$${dollars.toFixed(6)}`;
  }
  return `$${dollars.toFixed(4)}`;
}
