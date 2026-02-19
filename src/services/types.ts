import type { LLMProvider, ProviderConfig, ModelOption } from '@/types';

export const PROVIDER_CONFIGS: Record<LLMProvider, ProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-5.2-chat-latest',
    models: [
      { id: 'gpt-5.2-chat-latest', name: 'GPT-5.2 Instant', supportsJsonMode: true },
      { id: 'gpt-5.2', name: 'GPT-5.2 Thinking', supportsJsonMode: true },
      { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', supportsJsonMode: true },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-5',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', supportsJsonMode: true },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', supportsJsonMode: true },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', supportsJsonMode: true },
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', supportsJsonMode: true },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', supportsJsonMode: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', supportsJsonMode: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', supportsJsonMode: true },
    ],
  },
};

export function getModelsForProvider(provider: LLMProvider): ModelOption[] {
  return PROVIDER_CONFIGS[provider].models;
}

export function getDefaultModel(provider: LLMProvider): string {
  return PROVIDER_CONFIGS[provider].defaultModel;
}
