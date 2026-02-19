import { useConsoleStreamStore } from '@/stores/consoleStreamStore';

const API_URL = 'https://api.anthropic.com/v1/messages';

export interface LLMCallConfig {
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  onToken: (token: string) => void;
}

/**
 * Makes a single streaming call to Anthropic and returns the full text content.
 */
export async function callAnthropic(config: LLMCallConfig): Promise<string> {
  const runId = useConsoleStreamStore.getState().startRun(`Anthropic ${config.model}`);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        temperature: config.temperature,
        system: config.systemPrompt,
        messages: [
          { role: 'user', content: config.userPrompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let message = `Anthropic API error (${response.status})`;
      try {
        const parsed = JSON.parse(errorBody);
        message = parsed.error?.message ?? message;
      } catch { /* use default */ }
      throw new Error(message);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((l) => l.trim().startsWith('data:'));

      for (const line of lines) {
        const data = line.replace('data: ', '').trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta') {
            const token = parsed.delta?.text ?? '';
            if (token) {
              fullContent += token;
              useConsoleStreamStore.getState().appendToken(token);
              config.onToken(token);
            }
          }
        } catch { /* skip */ }
      }
    }

    return fullContent;
  } finally {
    useConsoleStreamStore.getState().endRun(runId);
  }
}
