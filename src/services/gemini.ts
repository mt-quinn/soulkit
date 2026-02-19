import { useConsoleStreamStore } from '@/stores/consoleStreamStore';

export interface LLMCallConfig {
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  onToken: (token: string) => void;
}

function getApiUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
}

/**
 * Makes a single streaming call to Gemini and returns the full text content.
 */
export async function callGemini(config: LLMCallConfig): Promise<string> {
  const runId = useConsoleStreamStore.getState().startRun(`Gemini ${config.model}`);

  try {
    const response = await fetch(getApiUrl(config.model, config.apiKey), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: config.systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: config.userPrompt }],
          },
        ],
        generationConfig: {
          temperature: config.temperature,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let message = `Gemini API error (${response.status})`;
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
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (text) {
            fullContent += text;
            useConsoleStreamStore.getState().appendToken(text);
            config.onToken(text);
          }
        } catch { /* skip */ }
      }
    }

    return fullContent;
  } finally {
    useConsoleStreamStore.getState().endRun(runId);
  }
}
