import type { LLMProvider, ProviderConfig } from '@/types';

export const FIXED_PROVIDER: LLMProvider = 'openai';
export const FIXED_PROVIDER_NAME = 'OpenAI';
export const FIXED_MODEL = 'gpt-5.2';
export const FIXED_MODEL_NAME = 'GPT-5.2 Thinking';
export const FIXED_TEMPERATURE = 0.95;

export const PROVIDER_CONFIGS: Record<LLMProvider, ProviderConfig> = {
  openai: {
    id: 'openai',
    name: FIXED_PROVIDER_NAME,
    defaultModel: FIXED_MODEL,
    models: [
      { id: FIXED_MODEL, name: FIXED_MODEL_NAME, supportsJsonMode: true },
    ],
  },
};
