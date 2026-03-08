import { getAIProvider, getAIProviderAsync, ChatMessage, ChatCompletionResult } from './ai-provider.js';
import type { GroundingDocument, GroundingDocCategory } from '@shared/schema';
import { GROUNDING_DOC_CATEGORY_LABELS, type AIFeature, AI_FEATURES } from '@shared/schema';
import { calculateEstimatedCost } from './ai-pricing.js';
import { checkUsageThresholds } from './ai-usage-alerts.js';
import { storage } from '../storage.js';

export type GroundingFeature = 'estimate_narrative' | 'estimate_generation' | 'invoice_narrative' | 'status_report' | 'sub_sow' | 'changelog' | 'general';

const FEATURE_CATEGORY_MAP: Record<GroundingFeature, GroundingDocCategory[]> = {
  estimate_narrative: ['estimate_narrative', 'pm_methodology', 'brand_voice', 'general'],
  estimate_generation: ['estimate_generation', 'estimate_narrative', 'pm_methodology', 'general'],
  invoice_narrative: ['invoice_narrative', 'brand_voice', 'general'],
  status_report: ['status_report', 'raidd_guidance', 'pm_methodology', 'brand_voice', 'general'],
  sub_sow: ['estimate_narrative', 'pm_methodology', 'brand_voice', 'general'],
  changelog: ['general', 'brand_voice'],
  general: ['general', 'pm_methodology', 'brand_voice'],
};

export function buildGroundingContext(docs: GroundingDocument[], feature?: GroundingFeature): string {
  if (!docs || docs.length === 0) return '';

  let relevantDocs = docs;
  if (feature) {
    const relevantCategories = FEATURE_CATEGORY_MAP[feature] || [];
    relevantDocs = docs.filter(d =>
      d.isTenantBackground || relevantCategories.includes(d.category as GroundingDocCategory)
    );
  }

  if (relevantDocs.length === 0) return '';

  relevantDocs.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.category || '').localeCompare(b.category || '');
  });

  const MAX_GROUNDING_CHARS = 50000;
  let totalChars = 0;
  const sections: string[] = [];

  for (const doc of relevantDocs) {
    const label = GROUNDING_DOC_CATEGORY_LABELS[doc.category as GroundingDocCategory] || doc.category;
    const section = `### ${label}: ${doc.title}\n${doc.content}`;
    if (totalChars + section.length > MAX_GROUNDING_CHARS) break;
    sections.push(section);
    totalChars += section.length;
  }

  if (sections.length === 0) return '';

  return `\n\n## Grounding Knowledge Base\nThe following knowledge documents provide context and guidelines. Use them to inform your response style, methodology, and domain knowledge.\n\n${sections.join('\n\n')}`;
}

export interface AiUsageContext {
  tenantId?: string;
  userId?: string;
  feature: AIFeature;
}

export async function logAiUsage(
  context: AiUsageContext,
  provider: { getProviderName(): string; getProviderModel(): string },
  result: ChatCompletionResult | null,
  latencyMs: number,
  error?: Error
): Promise<void> {
  try {
    const providerNameMap: Record<string, string> = {
      'Replit AI (OpenAI)': 'replit_ai',
      'Azure OpenAI': 'azure_openai',
      'Azure AI Foundry': 'azure_foundry',
    };
    const providerKey = providerNameMap[provider.getProviderName()] || provider.getProviderName();
    const model = provider.getProviderModel();

    const promptTokens = result?.promptTokens ?? 0;
    const completionTokens = result?.completionTokens ?? 0;
    const totalTokens = result?.totalTokens ?? 0;
    const estimatedCost = calculateEstimatedCost(model, promptTokens, completionTokens, providerKey);

    await storage.createAiUsageLog({
      tenantId: context.tenantId || null,
      userId: context.userId || null,
      provider: providerKey,
      model,
      feature: context.feature,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostMicrodollars: estimatedCost,
      latencyMs,
      errorCode: error ? 'ERROR' : null,
      errorMessage: error?.message?.substring(0, 500) || null,
    });

    checkUsageThresholds().catch(() => {});
  } catch (logError) {
    console.error('[AI_USAGE] Failed to log AI usage (non-blocking):', logError);
  }
}

export interface EstimateGenerationInput {
  projectDescription: string;
  narrativeText?: string;
  clientName?: string;
  industry?: string;
  constraints?: string;
  availableRoles?: Array<{
    name: string;
    rackRate: number;
    costRate: number;
    isSalaried: boolean;
  }>;
  groundingContext?: string;
}

export interface EstimateLineItemSuggestion {
  epicName: string;
  stageName: string;
  description: string;
  hours: number;
  role: string;
  notes?: string;
}

export interface GeneratedEstimateStructure {
  estimateType: 'detailed' | 'program' | 'block' | 'retainer';
  commercialScheme: 'time_and_materials' | 'fixed_price' | 'retainer';
  epics: Array<{
    name: string;
    order: number;
    stages: Array<{
      name: string;
      order: number;
      lineItems: Array<{
        description: string;
        role: string;
        hours: number;
        rate: number;
        costRate: number;
        isSalaried: boolean;
        notes?: string;
        weekStart?: number;
        durationWeeks?: number;
      }>;
    }>;
  }>;
  summary: {
    totalHours: number;
    totalFees: number;
    totalCost: number;
    marginPercent: number;
    projectSize: string;
    suggestedDurationWeeks: number;
  };
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

    estimateFromNarrative: `You are an expert consulting project estimator and work breakdown structure (WBS) architect. Your job is to analyze a project proposal, SOW, or narrative description and produce a fully structured estimate.

You MUST return valid JSON matching this exact structure:
{
  "estimateType": "detailed" | "program" | "block" | "retainer",
  "commercialScheme": "time_and_materials" | "fixed_price" | "retainer",
  "epics": [
    {
      "name": "Epic Name (e.g., Discovery & Planning)",
      "order": 1,
      "stages": [
        {
          "name": "Stage Name (e.g., Stakeholder Analysis)",
          "order": 1,
          "lineItems": [
            {
              "description": "Specific task or deliverable",
              "role": "Exact role name from the provided role catalog",
              "hours": 16,
              "rate": 225.00,
              "costRate": 150.00,
              "isSalaried": false,
              "notes": "Optional assumptions or context"
            }
          ]
        }
      ]
    }
  ],
  "summary": {
    "totalHours": 480,
    "totalFees": 96000.00,
    "totalCost": 64000.00,
    "marginPercent": 33.3,
    "projectSize": "Medium",
    "suggestedDurationWeeks": 12
  }
}

CRITICAL RULES:
1. ROLE MATCHING: You will be given a list of available roles with their rates. You MUST use EXACT role names from that list. Map the narrative's implied roles to the closest available role. Use the role's rackRate as "rate" and costRate as "costRate".
2. HIERARCHY: Every estimate must have at least 2 epics. Each epic has at least 1 stage. Each stage has at least 1 line item.
3. ESTIMATE TYPE: Use "detailed" for most projects. Use "program" for large multi-workstream engagements (3000+ hours). Use "retainer" only if the narrative explicitly describes a monthly retained arrangement. Use "block" for simple fixed-fee engagements.
4. LINE ITEM SIZING: No single line item should exceed 80 hours. Break larger tasks into smaller items.
5. STAFFING RATIOS: Include PM oversight (10-20% of total), architecture/design time where relevant, and QA where applicable.
6. INCLUDE SUPPORTING ACTIVITIES: Project kickoff, status reporting, knowledge transfer, documentation — these are real work that must be estimated.
7. REALISTIC HOURS: Base your estimates on consulting industry standards. A 2-week sprint is ~60-80 hours per developer. Stakeholder interviews are 2-4 hours each.
8. SUMMARY ACCURACY: The summary totals MUST match the sum of all line items. marginPercent = ((totalFees - totalCost) / totalFees) * 100.
9. If grounding methodology documents are provided, follow their guidance for role selection, hour estimation multipliers, epic templates, and quality checks.`,

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

  async generateEstimateDraft(input: EstimateGenerationInput, usageCtx?: AiUsageContext): Promise<EstimateLineItemSuggestion[]> {
    const provider = await getAIProviderAsync();

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

    const startTime = Date.now();
    let result: ChatCompletionResult;
    try {
      result = await provider.chatCompletion({
        messages,
        maxTokens: 4096,
        responseFormat: 'json'
      });
      logAiUsage(usageCtx || { feature: AI_FEATURES.ESTIMATE_GENERATION }, provider, result, Date.now() - startTime);
    } catch (error: any) {
      logAiUsage(usageCtx || { feature: AI_FEATURES.ESTIMATE_GENERATION }, provider, null, Date.now() - startTime, error);
      throw error;
    }

    try {
      const parsed = JSON.parse(result.content);
      return Array.isArray(parsed) ? parsed : parsed.lineItems || parsed.items || [];
    } catch (error) {
      console.error('[AI_SERVICE] Failed to parse estimate generation response:', error);
      throw new Error('Failed to parse AI response for estimate generation');
    }
  }

  async generateEstimateFromNarrative(input: EstimateGenerationInput, usageCtx?: AiUsageContext): Promise<GeneratedEstimateStructure> {
    const provider = await getAIProviderAsync();

    const narrativeContent = input.narrativeText || input.projectDescription;
    const truncatedNarrative = narrativeContent.substring(0, 100000);

    let rolesSection = '';
    if (input.availableRoles && input.availableRoles.length > 0) {
      rolesSection = `\n\nAVAILABLE ROLE CATALOG (you MUST use these exact role names and rates):\n${input.availableRoles.map(r =>
        `- ${r.name}: Billing Rate $${r.rackRate}/hr, Cost Rate $${r.costRate}/hr${r.isSalaried ? ' (Salaried — cost excluded from margin)' : ''}`
      ).join('\n')}`;
    }

    const userMessage = `Analyze the following project narrative and generate a fully structured estimate.
${input.clientName ? `\nClient: ${input.clientName}` : ''}
${input.industry ? `\nIndustry: ${input.industry}` : ''}
${input.constraints ? `\nConstraints/Notes: ${input.constraints}` : ''}
${rolesSection}

PROJECT NARRATIVE:
---
${truncatedNarrative}
---

Generate a complete hierarchical estimate structure with epics, stages, and line items. Use ONLY the roles from the catalog above. Return valid JSON.`;

    const systemContent = this.systemPrompts.estimateFromNarrative + (input.groundingContext || '');

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userMessage }
    ];

    const startTime = Date.now();
    let result: ChatCompletionResult;
    try {
      result = await provider.chatCompletion({
        messages,
        maxTokens: 16384,
        temperature: 0.4,
        responseFormat: 'json'
      });
      logAiUsage(usageCtx || { feature: AI_FEATURES.ESTIMATE_FROM_NARRATIVE }, provider, result, Date.now() - startTime);
    } catch (error: any) {
      logAiUsage(usageCtx || { feature: AI_FEATURES.ESTIMATE_FROM_NARRATIVE }, provider, null, Date.now() - startTime, error);
      throw error;
    }

    try {
      const parsed = JSON.parse(result.content);

      const structure: GeneratedEstimateStructure = {
        estimateType: parsed.estimateType || 'detailed',
        commercialScheme: parsed.commercialScheme || 'time_and_materials',
        epics: (parsed.epics || []).map((epic: any, ei: number) => ({
          name: epic.name || `Phase ${ei + 1}`,
          order: epic.order ?? ei + 1,
          stages: (epic.stages || []).map((stage: any, si: number) => ({
            name: stage.name || `Stage ${si + 1}`,
            order: stage.order ?? si + 1,
            lineItems: (stage.lineItems || []).map((li: any) => ({
              description: li.description || '',
              role: li.role || '',
              hours: Number(li.hours) || 0,
              rate: Number(li.rate) || 0,
              costRate: Number(li.costRate) || 0,
              isSalaried: li.isSalaried || false,
              notes: li.notes || undefined,
              weekStart: li.weekStart != null ? Number(li.weekStart) : undefined,
              durationWeeks: li.durationWeeks != null ? Number(li.durationWeeks) : undefined,
            })),
          })),
        })),
        summary: {
          totalHours: 0,
          totalFees: 0,
          totalCost: 0,
          marginPercent: 0,
          projectSize: parsed.summary?.projectSize || 'Medium',
          suggestedDurationWeeks: parsed.summary?.suggestedDurationWeeks || 12,
        },
      };

      let totalHours = 0;
      let totalFees = 0;
      let totalCost = 0;
      for (const epic of structure.epics) {
        for (const stage of epic.stages) {
          for (const li of stage.lineItems) {
            totalHours += li.hours;
            totalFees += li.hours * li.rate;
            totalCost += li.isSalaried ? 0 : li.hours * li.costRate;
          }
        }
      }
      structure.summary.totalHours = Math.round(totalHours * 10) / 10;
      structure.summary.totalFees = Math.round(totalFees * 100) / 100;
      structure.summary.totalCost = Math.round(totalCost * 100) / 100;
      structure.summary.marginPercent = totalFees > 0
        ? Math.round(((totalFees - totalCost) / totalFees) * 10000) / 100
        : 0;

      console.log(`[AI_SERVICE] Generated estimate from narrative: ${structure.epics.length} epics, ${totalHours} hours, $${totalFees.toFixed(0)} total`);

      return structure;
    } catch (error) {
      console.error('[AI_SERVICE] Failed to parse narrative estimate response:', error);
      console.error('[AI_SERVICE] Raw response:', result.content?.substring(0, 500));
      throw new Error('Failed to parse AI response for estimate generation from narrative');
    }
  }

  async naturalLanguageReport(input: NaturalLanguageReportInput, usageCtx?: AiUsageContext): Promise<string> {
    const provider = await getAIProviderAsync();

    const userMessage = `User Query: ${input.query}

Available Data Context:
${input.context.availableData.join('\n')}
${input.context.currentFilters ? `\nCurrent Filters: ${JSON.stringify(input.context.currentFilters)}` : ''}

Please provide a helpful response to the user's query based on the available context.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompts.naturalLanguageReport },
      { role: 'user', content: userMessage }
    ];

    const startTime = Date.now();
    try {
      const result = await provider.chatCompletion({
        messages,
        temperature: 0.5,
        maxTokens: 2048
      });
      logAiUsage(usageCtx || { feature: AI_FEATURES.REPORT_QUERY }, provider, result, Date.now() - startTime);
      return result.content;
    } catch (error: any) {
      logAiUsage(usageCtx || { feature: AI_FEATURES.REPORT_QUERY }, provider, null, Date.now() - startTime, error);
      throw error;
    }
  }

  async generateInvoiceNarrative(input: InvoiceNarrativeInput, groundingContext?: string, usageCtx?: AiUsageContext): Promise<string> {
    const provider = await getAIProviderAsync();

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

    const systemContent = this.systemPrompts.invoiceNarrative + (groundingContext || '');
    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userMessage }
    ];

    const startTime = Date.now();
    try {
      const result = await provider.chatCompletion({
        messages,
        temperature: 0.6,
        maxTokens: 1024
      });
      logAiUsage(usageCtx || { feature: AI_FEATURES.INVOICE_NARRATIVE }, provider, result, Date.now() - startTime);
      return result.content;
    } catch (error: any) {
      logAiUsage(usageCtx || { feature: AI_FEATURES.INVOICE_NARRATIVE }, provider, null, Date.now() - startTime, error);
      throw error;
    }
  }

  async generateEstimateNarrative(input: EstimateNarrativeInput, groundingContext?: string, usageCtx?: AiUsageContext): Promise<string> {
    const provider = await getAIProviderAsync();

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

    let userMessage = `Generate a comprehensive proposal narrative for the following estimate:

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

    const MAX_PROMPT_CHARS = 100000;
    if (userMessage.length > MAX_PROMPT_CHARS) {
      console.log(`[AI] Prompt too large (${userMessage.length} chars), truncating to ${MAX_PROMPT_CHARS} chars`);
      userMessage = userMessage.substring(0, MAX_PROMPT_CHARS) + '\n\n[Note: Some line item details were trimmed for length. Generate the narrative based on the information provided above.]';
    }

    const systemContent = this.systemPrompts.estimateNarrative + (groundingContext || '');
    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userMessage }
    ];

    const startTime = Date.now();
    try {
      const result = await provider.chatCompletion({
        messages,
        maxTokens: 16384
      });
      logAiUsage(usageCtx || { feature: AI_FEATURES.ESTIMATE_NARRATIVE }, provider, result, Date.now() - startTime);
      return result.content;
    } catch (error: any) {
      logAiUsage(usageCtx || { feature: AI_FEATURES.ESTIMATE_NARRATIVE }, provider, null, Date.now() - startTime, error);
      throw error;
    }
  }

  async generateSubSOWNarrative(input: SubSOWNarrativeInput, groundingContext?: string, usageCtx?: AiUsageContext): Promise<string> {
    const provider = await getAIProviderAsync();

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

    const systemContent = this.systemPrompts.subSOWNarrative + (groundingContext || '');
    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userMessage }
    ];

    const startTime = Date.now();
    try {
      const result = await provider.chatCompletion({
        messages,
        maxTokens: 16384
      });
      logAiUsage(usageCtx || { feature: AI_FEATURES.SUB_SOW_NARRATIVE }, provider, result, Date.now() - startTime);
      return result.content;
    } catch (error: any) {
      logAiUsage(usageCtx || { feature: AI_FEATURES.SUB_SOW_NARRATIVE }, provider, null, Date.now() - startTime, error);
      throw error;
    }
  }

  async chat(userMessage: string, context?: string, usageCtx?: AiUsageContext): Promise<ChatCompletionResult> {
    const provider = await getAIProviderAsync();

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompts.general + (context ? `\n\nContext:\n${context}` : '') },
      { role: 'user', content: userMessage }
    ];

    const startTime = Date.now();
    try {
      const result = await provider.chatCompletion({
        messages,
        temperature: 0.7,
        maxTokens: 2048
      });
      logAiUsage(usageCtx || { feature: AI_FEATURES.HELP_CHAT }, provider, result, Date.now() - startTime);
      return result;
    } catch (error: any) {
      logAiUsage(usageCtx || { feature: AI_FEATURES.HELP_CHAT }, provider, null, Date.now() - startTime, error);
      throw error;
    }
  }

  async customPrompt(
    systemPrompt: string,
    userMessage: string,
    options?: { temperature?: number; maxTokens?: number; responseFormat?: 'text' | 'json'; groundingContext?: string; usageCtx?: AiUsageContext }
  ): Promise<ChatCompletionResult> {
    const provider = await getAIProviderAsync();

    const systemContent = systemPrompt + (options?.groundingContext || '');
    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userMessage }
    ];

    const startTime = Date.now();
    try {
      const result = await provider.chatCompletion({
        messages,
        maxTokens: options?.maxTokens ?? 2048,
        responseFormat: options?.responseFormat
      });
      logAiUsage(options?.usageCtx || { feature: AI_FEATURES.CUSTOM }, provider, result, Date.now() - startTime);
      return result;
    } catch (error: any) {
      logAiUsage(options?.usageCtx || { feature: AI_FEATURES.CUSTOM }, provider, null, Date.now() - startTime, error);
      throw error;
    }
  }
}

export const aiService = new AIService();
