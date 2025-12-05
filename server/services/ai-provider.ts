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
}

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

export type AIProviderType = 'azure' | 'openai' | 'anthropic';

export function createAIProvider(type?: AIProviderType): IAIProvider {
  const providerType = type || (process.env.AI_PROVIDER as AIProviderType) || 'azure';

  switch (providerType) {
    case 'azure':
    default:
      return new AzureOpenAIProvider();
  }
}

let defaultProvider: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (!defaultProvider) {
    defaultProvider = createAIProvider();
  }
  return defaultProvider;
}
