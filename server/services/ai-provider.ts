import OpenAI from "openai";

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionParams {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface ChatCompletionResult {
  content: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

export interface IAIProvider {
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;
  isConfigured(): boolean;
  getProviderName(): string;
}

// Replit AI Integrations provider using OpenAI SDK
// This uses Replit's AI Integrations service, which provides OpenAI-compatible API access
// without requiring your own API key - charges are billed to your Replit credits
export class ReplitAIProvider implements IAIProvider {
  private client: OpenAI | null = null;

  constructor() {
    if (this.isConfigured()) {
      this.client = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      });
    }
  }

  isConfigured(): boolean {
    return !!(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
  }

  getProviderName(): string {
    return 'Replit AI (OpenAI)';
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    if (!this.client) {
      throw new Error('Replit AI Integrations is not configured.');
    }

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      model: "gpt-5",
      messages: params.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_completion_tokens: params.maxTokens ?? 8192,
    };

    if (params.responseFormat === 'json') {
      requestParams.response_format = { type: 'json_object' };
    }

    try {
      const response = await this.client.chat.completions.create(requestParams);

      return {
        content: response.choices?.[0]?.message?.content || '',
        totalTokens: response.usage?.total_tokens || 0,
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
      };
    } catch (error: any) {
      console.error('[AI_PROVIDER] Replit AI error:', error.message);
      throw new Error(`AI API error: ${error.message}`);
    }
  }
}

// Azure OpenAI provider (for users who want to use their own Azure OpenAI deployment)
export class AzureOpenAIProvider implements IAIProvider {
  private endpoint: string;
  private apiKey: string;
  private deployment: string;
  private apiVersion: string;

  constructor() {
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    this.apiKey = process.env.AZURE_OPENAI_KEY || '';
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-51';
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';
  }

  isConfigured(): boolean {
    return !!(this.endpoint && this.apiKey && this.deployment);
  }

  getProviderName(): string {
    return 'Azure OpenAI';
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    if (!this.isConfigured()) {
      throw new Error('Azure OpenAI is not configured. Please set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, and AZURE_OPENAI_DEPLOYMENT environment variables.');
    }

    const url = `${this.endpoint}/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;

    const body: Record<string, any> = {
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 4096,
    };

    if (params.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI_PROVIDER] Azure OpenAI error:', response.status, errorText);
      throw new Error(`Azure OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.choices?.[0]?.message?.content || '',
      totalTokens: data.usage?.total_tokens || 0,
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
    };
  }
}

export type AIProviderType = 'replit' | 'azure' | 'openai' | 'anthropic';

export function createAIProvider(type?: AIProviderType): IAIProvider {
  const providerType = type || (process.env.AI_PROVIDER as AIProviderType);

  // If explicit provider type specified, use it
  if (providerType === 'azure') {
    return new AzureOpenAIProvider();
  }
  
  if (providerType === 'replit') {
    return new ReplitAIProvider();
  }

  // Auto-detect: prefer Replit AI Integrations if configured, then Azure
  const replitProvider = new ReplitAIProvider();
  if (replitProvider.isConfigured()) {
    return replitProvider;
  }

  const azureProvider = new AzureOpenAIProvider();
  if (azureProvider.isConfigured()) {
    return azureProvider;
  }

  // Default to Replit provider (will show not configured error if used)
  return replitProvider;
}

let defaultProvider: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (!defaultProvider) {
    defaultProvider = createAIProvider();
  }
  return defaultProvider;
}
