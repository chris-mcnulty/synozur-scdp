import { getAIProvider, ChatMessage, ChatCompletionResult } from './ai-provider.js';

export interface EstimateGenerationInput {
  projectDescription: string;
  clientName?: string;
  industry?: string;
  constraints?: string;
}

export interface EstimateLineItemSuggestion {
  epicName: string;
  stageName: string;
  description: string;
  hours: number;
  role: string;
  notes?: string;
}

export interface NaturalLanguageReportInput {
  query: string;
  context: {
    availableData: string[];
    currentFilters?: Record<string, any>;
  };
}

export interface InvoiceNarrativeInput {
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
}

class AIService {
  private systemPrompts = {
    estimateGeneration: `You are an expert consulting project estimator. Given a project description, generate a detailed work breakdown structure with line items.

Each line item should include:
- Epic name (high-level work category)
- Stage name (phase within the epic)
- Description (specific task or deliverable)
- Estimated hours
- Recommended role (e.g., Consultant, Senior Consultant, Principal, Partner)
- Optional notes

Format your response as a JSON array of line items. Be realistic with hour estimates based on consulting industry standards.`,

    naturalLanguageReport: `You are a business intelligence assistant for a consulting delivery platform. Help users understand their project, financial, and resource data.

Interpret natural language queries and provide helpful, accurate responses based on the context provided. If you need more information to answer accurately, say so.

Always be concise and actionable in your responses.`,

    invoiceNarrative: `You are a professional business writer specializing in consulting invoices and client communications.

Generate clear, professional invoice narratives that:
- Summarize work completed during the period
- Highlight key deliverables and milestones
- Use professional but accessible language
- Are appropriate for C-level executives to read

Keep narratives concise (2-4 paragraphs) but comprehensive.`,

    general: `You are an AI assistant for SCDP, a consulting delivery management platform. Help users with questions about projects, estimates, resources, expenses, and invoicing.

Be helpful, accurate, and concise. If you're unsure about something, say so.`
  };

  isConfigured(): boolean {
    return getAIProvider().isConfigured();
  }

  async generateEstimateDraft(input: EstimateGenerationInput): Promise<EstimateLineItemSuggestion[]> {
    const provider = getAIProvider();

    const userMessage = `Generate an estimate for the following project:

Project Description: ${input.projectDescription}
${input.clientName ? `Client: ${input.clientName}` : ''}
${input.industry ? `Industry: ${input.industry}` : ''}
${input.constraints ? `Constraints/Notes: ${input.constraints}` : ''}

Provide a comprehensive work breakdown with realistic hour estimates. Return as a JSON array.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompts.estimateGeneration },
      { role: 'user', content: userMessage }
    ];

    const result = await provider.chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 4096,
      responseFormat: 'json'
    });

    try {
      const parsed = JSON.parse(result.content);
      return Array.isArray(parsed) ? parsed : parsed.lineItems || parsed.items || [];
    } catch (error) {
      console.error('[AI_SERVICE] Failed to parse estimate generation response:', error);
      throw new Error('Failed to parse AI response for estimate generation');
    }
  }

  async naturalLanguageReport(input: NaturalLanguageReportInput): Promise<string> {
    const provider = getAIProvider();

    const userMessage = `User Query: ${input.query}

Available Data Context:
${input.context.availableData.join('\n')}
${input.context.currentFilters ? `\nCurrent Filters: ${JSON.stringify(input.context.currentFilters)}` : ''}

Please provide a helpful response to the user's query based on the available context.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompts.naturalLanguageReport },
      { role: 'user', content: userMessage }
    ];

    const result = await provider.chatCompletion({
      messages,
      temperature: 0.5,
      maxTokens: 2048
    });

    return result.content;
  }

  async generateInvoiceNarrative(input: InvoiceNarrativeInput): Promise<string> {
    const provider = getAIProvider();

    const lineItemsSummary = input.lineItems.map(item => 
      `- ${item.description}${item.hours ? ` (${item.hours} hours)` : ''}: $${item.amount.toFixed(2)}`
    ).join('\n');

    const userMessage = `Generate a professional invoice narrative for:

Project: ${input.projectName}
Client: ${input.clientName}
Period: ${input.periodStart} to ${input.periodEnd}

Work Completed:
${lineItemsSummary}

${input.milestones?.length ? `Key Milestones: ${input.milestones.join(', ')}` : ''}

Write a professional narrative suitable for the invoice.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompts.invoiceNarrative },
      { role: 'user', content: userMessage }
    ];

    const result = await provider.chatCompletion({
      messages,
      temperature: 0.6,
      maxTokens: 1024
    });

    return result.content;
  }

  async chat(userMessage: string, context?: string): Promise<ChatCompletionResult> {
    const provider = getAIProvider();

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompts.general + (context ? `\n\nContext:\n${context}` : '') },
      { role: 'user', content: userMessage }
    ];

    return provider.chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 2048
    });
  }

  async customPrompt(
    systemPrompt: string,
    userMessage: string,
    options?: { temperature?: number; maxTokens?: number; responseFormat?: 'text' | 'json' }
  ): Promise<ChatCompletionResult> {
    const provider = getAIProvider();

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    return provider.chatCompletion({
      messages,
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 2048,
      responseFormat: options?.responseFormat
    });
  }
}

export const aiService = new AIService();
