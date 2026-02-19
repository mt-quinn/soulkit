import { useConsoleStreamStore } from '@/stores/consoleStreamStore';
const API_URL = 'https://api.openai.com/v1/chat/completions';

export interface LLMCallConfig {
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  onToken: (token: string) => void;
}

/**
 * Makes a single streaming call to OpenAI and returns the full text content.
 */
export async function callOpenAI(config: LLMCallConfig): Promise<string> {
  const runId = useConsoleStreamStore.getState().startRun(`OpenAI ${config.model}`);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: config.userPrompt },
        ],
        temperature: config.temperature,
        response_format: { type: 'json_object' },
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let message = `OpenAI API error (${response.status})`;
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
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content ?? '';
          if (token) {
            fullContent += token;
            useConsoleStreamStore.getState().appendToken(token);
            config.onToken(token);
          }
        } catch { /* skip */ }
      }
    }

    return fullContent;
  } finally {
    useConsoleStreamStore.getState().endRun(runId);
  }
}
