import { useQuery } from "@tanstack/react-query";

export interface EffectiveRate {
  lineItemId: string;
  precedence: 'manual_override' | 'estimate_override' | 'user_default' | 'role_default' | 'none';
  billingRate: number | null;
  costRate: number | null;
  source: string;
  overrideId?: string;
  chain: Array<{ level: string; value: string; }>;
}

export function useEffectiveRates(estimateId: string | undefined) {
  return useQuery<EffectiveRate[]>({
    queryKey: ['/api/estimates', estimateId, 'effective-rates'],
    enabled: !!estimateId,
  });
}
