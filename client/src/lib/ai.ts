import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";

export interface AIStatus {
  configured: boolean;
  provider: string;
}

export interface ChatResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface EstimateLineItemSuggestion {
  epicName: string;
  stageName: string;
  description: string;
  hours: number;
  role: string;
  notes?: string;
}

export interface GenerateEstimateResponse {
  lineItems: EstimateLineItemSuggestion[];
}

export interface InvoiceNarrativeResponse {
  narrative: string;
}

export interface ReportQueryResponse {
  response: string;
}

export function useAIStatus() {
  return useQuery<AIStatus>({
    queryKey: ["/api/ai/status"],
    staleTime: 60000,
  });
}

export function useAIChat() {
  return useMutation({
    mutationFn: async (params: { message: string; context?: string }): Promise<ChatResponse> => {
      return apiRequest("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  });
}

export function useGenerateEstimate() {
  return useMutation({
    mutationFn: async (params: {
      projectDescription: string;
      clientName?: string;
      industry?: string;
      constraints?: string;
    }): Promise<GenerateEstimateResponse> => {
      return apiRequest("/api/ai/generate-estimate", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  });
}

export function useGenerateInvoiceNarrative() {
  return useMutation({
    mutationFn: async (params: {
      projectName: string;
      clientName: string;
      periodStart: string;
      periodEnd: string;
      lineItems: Array<{
        description: string;
        hours?: number;
        amount: number;
        category?: string;
      }>;
      milestones?: string[];
    }): Promise<InvoiceNarrativeResponse> => {
      return apiRequest("/api/ai/invoice-narrative", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  });
}

export function useReportQuery() {
  return useMutation({
    mutationFn: async (params: {
      query: string;
      context: {
        availableData: string[];
        currentFilters?: Record<string, any>;
      };
    }): Promise<ReportQueryResponse> => {
      return apiRequest("/api/ai/report-query", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  });
}
