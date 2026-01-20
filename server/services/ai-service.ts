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

export interface EstimateNarrativeInput {
  estimateName: string;
  clientName: string;
  estimateDate: string;
  validUntil?: string;
  totalHours: number;
  totalFees: number;
  epics: Array<{
    name: string;
    order: number;
    stages: Array<{
      name: string;
      order: number;
      lineItems: Array<{
        description: string;
        hours: number;
        role?: string;
        comments?: string;
      }>;
    }>;
    totalHours: number;
    totalFees: number;
    roleBreakdown: Array<{
      role: string;
      hours: number;
      percentage: number;
    }>;
  }>;
  milestones?: Array<{
    name: string;
    description?: string;
    dueDate?: string;
  }>;
}

export interface SubSOWNarrativeInput {
  projectName: string;
  clientName: string;
  resourceName: string;
  resourceRole: string;
  isSalaried: boolean;
  totalHours: number;
  totalCost: number;
  assignments: Array<{
    epicName?: string;
    stageName?: string;
    description: string;
    hours: number;
    rate: number;
    amount: number;
    comments?: string;
  }>;
  projectStartDate?: string;
  projectEndDate?: string;
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

    estimateNarrative: `You are an expert consulting proposal writer. Your task is to generate a comprehensive, professional narrative summary of a project estimate that is suitable for inclusion in a client proposal document.

The narrative should be written in rich, professional prose that is appropriate for C-level executives and procurement teams. Use clear section headers and bullet points where appropriate for readability.

For each EPIC, you must address the following key client questions:

1. **Scope Definition**: What is explicitly IN SCOPE and OUT OF SCOPE for this Epic? Be specific about boundaries.

2. **Deliverables**: What concrete deliverables will the client receive? (documents, tools, models, dashboards, code, processes, training materials, workshops, etc.)

3. **Sprint/Phase Duration**: Based on the hours allocated, estimate how long each phase/sprint might take (assume 2-week sprints, 40 hours per person per week).

4. **Staffing & Allocation**: What roles will be staffed and at what approximate percentage allocation? Show the breakdown clearly.

5. **Success Criteria & KPIs**: What key performance indicators will indicate progress or success? Be specific and measurable where possible.

6. **Client Dependencies**: What inputs, access, or resources must the client provide for the plan to work? Help them understand their time and resource commitment.

**IMPORTANT**: If assumptions are provided in the input, you MUST include a dedicated "Assumptions and Dependencies" section at the END of the proposal narrative. This section should:
- List all identified assumptions clearly
- Group related assumptions logically
- Indicate which assumptions require client validation or sign-off
- Note any risks if assumptions prove incorrect

Format the output as professional proposal text with clear headers and sections. Use markdown formatting for rich text (headers, bold, bullets, tables where helpful).`,

    general: `You are an AI assistant for SCDP, a consulting delivery management platform. Help users with questions about projects, estimates, resources, expenses, and invoicing.

Be helpful, accurate, and concise. If you're unsure about something, say so.`,

    subSOWNarrative: `You are an expert consulting proposal writer specializing in subcontractor scope of work documents. Your task is to generate a professional Sub-Statement of Work (Sub-SOW) narrative that can be included in a subcontractor agreement.

The narrative should:
1. Clearly describe the scope of work the resource will perform
2. Group related activities logically by epic/phase when available
3. Highlight key deliverables and responsibilities
4. Use professional language appropriate for a legal/contractual document
5. Be comprehensive but concise (2-4 paragraphs per section)

Structure the narrative with clear sections:
- **Scope Overview**: Brief introduction of the engagement and the resource's role
- **Work Breakdown**: Detailed description of tasks and activities, organized by epic/phase
- **Deliverables**: Expected outputs and results
- **Timeline Considerations**: Estimated effort and any phasing considerations

Use markdown formatting with headers and bullet points for clarity.`
  };

  isConfigured(): boolean {
    return getAIProvider().isConfigured();
  }

  getProviderName(): string {
    return getAIProvider().getProviderName();
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

  async generateEstimateNarrative(input: EstimateNarrativeInput): Promise<string> {
    const provider = getAIProvider();

    // Extract assumptions from all line item comments
    const assumptionPatterns = [
      /assumption[s]?:\s*/i,
      /assume[s]?:\s*/i,
      /assuming:\s*/i,
      /\bA:\s*/i,
      /presume[s]?:\s*/i,
      /prerequisite[s]?:\s*/i,
      /depend[s]? on:\s*/i,
      /require[s]?:\s*/i,
      /contingent on:\s*/i,
      /based on:\s*/i
    ];
    
    const assumptions: { epic: string; stage: string; description: string; assumption: string }[] = [];
    
    // Scan all line items for assumptions in comments
    for (const epic of input.epics) {
      for (const stage of epic.stages) {
        for (const item of stage.lineItems) {
          if (item.comments) {
            // Check if comment contains assumption-like content
            for (const pattern of assumptionPatterns) {
              if (pattern.test(item.comments)) {
                // Extract the assumption text - everything after the pattern
                const match = item.comments.match(pattern);
                if (match) {
                  const assumptionText = item.comments.substring(match.index! + match[0].length).trim();
                  if (assumptionText) {
                    assumptions.push({
                      epic: epic.name,
                      stage: stage.name,
                      description: item.description,
                      assumption: assumptionText
                    });
                  }
                }
                break; // Only match first pattern per comment
              }
            }
            // Also check for comments that look like assumptions even without explicit keywords
            // (e.g., comments starting with "Client will..." or "Assumes...")
            if (!assumptions.find(a => a.description === item.description && a.epic === epic.name)) {
              const implicitAssumptionPatterns = [
                /^client will\s+/i,
                /^customer will\s+/i,
                /^user will\s+/i,
                /^team will\s+/i,
                /^assumes?\s+/i,
                /^provided that\s+/i,
                /^given that\s+/i,
                /^if\s+.*,?\s*then/i
              ];
              for (const pattern of implicitAssumptionPatterns) {
                if (pattern.test(item.comments)) {
                  assumptions.push({
                    epic: epic.name,
                    stage: stage.name,
                    description: item.description,
                    assumption: item.comments
                  });
                  break;
                }
              }
            }
          }
        }
      }
    }

    // Build detailed epic summaries
    const epicSummaries = input.epics
      .sort((a, b) => a.order - b.order)
      .map(epic => {
        const stageSummaries = epic.stages
          .sort((a, b) => a.order - b.order)
          .map(stage => {
            const itemList = stage.lineItems.map(item => 
              `      - ${item.description}${item.role ? ` (${item.role})` : ''}${item.hours ? ` - ${item.hours} hours` : ''}${item.comments ? ` | Notes: ${item.comments}` : ''}`
            ).join('\n');
            return `    Stage: ${stage.name}\n${itemList}`;
          }).join('\n\n');

        const roleBreakdown = epic.roleBreakdown
          .map(r => `    - ${r.role}: ${r.hours} hours (${r.percentage.toFixed(1)}%)`)
          .join('\n');

        return `
EPIC: ${epic.name}
Total Hours: ${epic.totalHours}
Total Fees: $${epic.totalFees.toLocaleString()}

Stages and Activities:
${stageSummaries}

Role Allocation:
${roleBreakdown}
`;
      }).join('\n' + '='.repeat(60) + '\n');

    const milestoneSummary = input.milestones?.length 
      ? `\nMILESTONES:\n${input.milestones.map(m => `- ${m.name}${m.dueDate ? ` (Due: ${m.dueDate})` : ''}${m.description ? `: ${m.description}` : ''}`).join('\n')}`
      : '';

    // Build assumptions section
    const assumptionsSummary = assumptions.length > 0
      ? `\nKEY ASSUMPTIONS AND DEPENDENCIES:\n${'='.repeat(40)}\nThe following assumptions have been identified from line item notes and must be validated with the client:\n\n${assumptions.map((a, idx) => 
          `${idx + 1}. [${a.epic} > ${a.stage}] ${a.description}\n   → ${a.assumption}`
        ).join('\n\n')}\n\nIMPORTANT: Please include a dedicated "Assumptions and Dependencies" section at the END of the proposal narrative that clearly lists these assumptions for client review and acknowledgment.`
      : '';

    const userMessage = `Generate a comprehensive proposal narrative for the following estimate:

ESTIMATE OVERVIEW
================
Name: ${input.estimateName}
Client: ${input.clientName}
Date: ${input.estimateDate}
${input.validUntil ? `Valid Until: ${input.validUntil}` : ''}
Total Hours: ${input.totalHours}
Total Investment: $${input.totalFees.toLocaleString()}

DETAILED BREAKDOWN BY EPIC
==========================
${epicSummaries}
${milestoneSummary}
${assumptionsSummary}

Please generate a professional proposal narrative that addresses all six key client questions for each Epic (scope, deliverables, duration, staffing, KPIs, and client dependencies). Make it suitable for a formal proposal document.${assumptions.length > 0 ? ' IMPORTANT: End the narrative with a dedicated "Assumptions and Dependencies" section that consolidates all identified assumptions for client acknowledgment.' : ''}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompts.estimateNarrative },
      { role: 'user', content: userMessage }
    ];

    const result = await provider.chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 8192  // Larger for comprehensive narratives
    });

    return result.content;
  }

  async generateSubSOWNarrative(input: SubSOWNarrativeInput): Promise<string> {
    const provider = getAIProvider();

    // Group assignments by epic
    const epicGroups = new Map<string, typeof input.assignments>();
    for (const assignment of input.assignments) {
      const epicName = assignment.epicName || 'General';
      if (!epicGroups.has(epicName)) {
        epicGroups.set(epicName, []);
      }
      epicGroups.get(epicName)!.push(assignment);
    }

    // Build epic summaries
    const epicSummaries = Array.from(epicGroups.entries())
      .map(([epicName, assignments]) => {
        const epicHours = assignments.reduce((sum, a) => sum + a.hours, 0);
        const epicAmount = assignments.reduce((sum, a) => sum + a.amount, 0);
        
        const taskList = assignments.map(a => {
          const stagePrefix = a.stageName ? `[${a.stageName}] ` : '';
          return `- ${stagePrefix}${a.description}: ${a.hours} hours${a.comments ? ` (${a.comments})` : ''}`;
        }).join('\n');

        return `
EPIC: ${epicName}
Hours: ${epicHours}
${!input.isSalaried ? `Amount: $${epicAmount.toLocaleString()}` : ''}
Tasks:
${taskList}`;
      }).join('\n' + '-'.repeat(40) + '\n');

    const userMessage = `Generate a professional Sub-Statement of Work narrative for the following subcontractor assignment:

ENGAGEMENT DETAILS
==================
Project: ${input.projectName}
Client: ${input.clientName}
${input.projectStartDate ? `Project Start: ${input.projectStartDate}` : ''}
${input.projectEndDate ? `Project End: ${input.projectEndDate}` : ''}

RESOURCE DETAILS
================
Name: ${input.resourceName}
Role: ${input.resourceRole}
Employment Type: ${input.isSalaried ? 'Salaried Employee (No Cost)' : 'Subcontractor'}
Total Hours: ${input.totalHours}
${!input.isSalaried ? `Total Cost: $${input.totalCost.toLocaleString()}` : 'Total Cost: $0 (Salaried Resource)'}

ASSIGNED WORK
=============
${epicSummaries}

Please generate a professional Sub-SOW narrative suitable for inclusion in a subcontractor agreement. Focus on clearly defining the scope of work, deliverables, and expectations.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompts.subSOWNarrative },
      { role: 'user', content: userMessage }
    ];

    const result = await provider.chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 4096
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
