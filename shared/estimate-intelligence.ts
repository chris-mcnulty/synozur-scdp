export interface IntelligenceMetric {
  estimated: number | null;
  actual: number | null;
  delta: number | null;
  variancePercent: number | null;
}

export interface EstimateComparable {
  projectId: string;
  projectName: string;
  projectUrl: string;
  estimateId?: string;
  estimateUrl?: string;
  baseline: string;
  score: number;
  matchingReasons: string[];
  effort: IntelligenceMetric;
  cost?: IntelligenceMetric & { currency: string };
  limitations: string[];
}

export interface EstimateIntelligenceReview {
  status: "evidence_available" | "insufficient_evidence";
  method: string;
  advisory: string;
  sampleSize: number;
  comparableCount: number;
  costVisible: boolean;
  comparables: EstimateComparable[];
  risks: Array<{
    kind: "scope_gap" | "effort_variance" | "cost_uncertainty";
    title: string;
    detail: string;
    projectIds: string[];
  }>;
  limitations: string[];
}
