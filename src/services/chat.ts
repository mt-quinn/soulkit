import { callOpenAI } from './openai';
import { FIXED_MODEL, FIXED_TEMPERATURE } from './types';
import type { GeneratedProfile, SchemaPreset } from '@/types';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  throw new Error('Model did not return valid JSON.');
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function limitSentences(value: string, maxSentences: number): string {
  if (maxSentences <= 0) return '';
  const parts = value.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= maxSentences) return value;
  return parts.slice(0, maxSentences).join(' ').trim();
}

function limitWords(value: string, maxWords: number): string {
  if (maxWords <= 0) return '';
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, maxWords).join(' ').trim()}...`;
}

function ensureTerminalPunctuation(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function limitSceneWords(value: string, maxWords: number): string {
  if (maxWords <= 0) return '';
  const compact = normalizeWhitespace(value);
  if (!compact) return '';

  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  const source = sentences.length > 0 ? sentences : [compact];
  const accepted: string[] = [];
  let usedWords = 0;

  for (const sentence of source) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    if (usedWords + words.length <= maxWords) {
      accepted.push(sentence);
      usedWords += words.length;
      continue;
    }

    if (accepted.length === 0) {
      accepted.push(words.slice(0, maxWords).join(' '));
    }
    break;
  }

  return ensureTerminalPunctuation(normalizeWhitespace(accepted.join(' ')));
}

function sanitizeScene(value: string): string {
  const compact = normalizeWhitespace(value);
  return limitSceneWords(limitSentences(compact, 2), 36);
}

function sanitizeReply(value: string): string {
  const compact = normalizeWhitespace(value);
  return limitWords(limitSentences(compact, 3), 72);
}

function summarizeSchema(schema: SchemaPreset | null): string {
  if (!schema) return 'No schema metadata available.';
  const fieldSummary = schema.fields
    .map((field) => `${field.key} (${field.type})`)
    .join(', ');

  return `Schema name: ${schema.name}
${schema.description ? `Schema description: ${schema.description}` : ''}
Fields: ${fieldSummary}`;
}

function transcriptFrom(history: ChatTurn[], nextUserMessage: string): string {
  const lastTurns = history.slice(-16);
  const transcriptLines = [
    ...lastTurns.map((turn) => `${turn.role === 'assistant' ? 'Character' : 'User'}: ${turn.content}`),
    `User: ${nextUserMessage}`,
  ];
  return transcriptLines.join('\n');
}

export async function generateSceneFromSchema(config: {
  apiKey: string;
  profile: GeneratedProfile;
  schema: SchemaPreset | null;
  onToken: (token: string) => void;
}): Promise<string> {
  const { apiKey, profile, schema, onToken } = config;
  const raw = await callOpenAI({
    apiKey,
    model: FIXED_MODEL,
    temperature: FIXED_TEMPERATURE,
    systemPrompt: `You create short conversation context blurbs for character chat.

Return JSON only:
{
  "scene": string
}

Rules:
- Output must be concise: 1-2 short sentences, max 36 words.
- Keep it practical and clean, not cinematic.
- No action set-pieces, no dramatic narration, no plot escalation.
- Goal: give just enough context for a direct 1:1 conversation.
- Do not end with an ellipsis.`,
    userPrompt: `Create a concise conversation context for this character:

Character profile:
\`\`\`json
${JSON.stringify(profile.profile, null, 2)}
\`\`\`

${summarizeSchema(schema)}

Return only JSON.`,
    onToken,
  });

  const parsed = JSON.parse(extractJsonObject(raw)) as { scene?: unknown };
  const scene = sanitizeScene(readString(parsed.scene));
  if (!scene) throw new Error('Scene generation returned empty output.');
  return scene;
}

export async function generateCharacterReply(config: {
  apiKey: string;
  profile: GeneratedProfile;
  schema: SchemaPreset | null;
  scene: string;
  history: ChatTurn[];
  userMessage: string;
  onToken: (token: string) => void;
}): Promise<string> {
  const { apiKey, profile, schema, scene, history, userMessage, onToken } = config;
  const raw = await callOpenAI({
    apiKey,
    model: FIXED_MODEL,
    temperature: FIXED_TEMPERATURE,
    systemPrompt: `You are writing a direct 1:1 in-character chat reply.

You MUST speak as the character, not as an assistant.
Do not break character. Do not mention prompts, policies, or being an AI.
Match the character profile and schema intent closely.
Use the provided context and chat history, but keep the reply as plain conversation.

Return JSON only:
{
  "reply": string
}

Style rules:
- Concise by default: 1-3 short sentences, max 72 words.
- No narration, no stage directions, no action lines.
- No third-person descriptions of events.
- Do not invent dramatic scene beats; just respond to the user's message.`,
    userPrompt: `Character profile:
\`\`\`json
${JSON.stringify(profile.profile, null, 2)}
\`\`\`

${summarizeSchema(schema)}

Conversation context:
${scene.trim() || 'No extra context provided.'}

Conversation transcript:
${transcriptFrom(history, userMessage.trim())}

Write the next in-character reply and return only JSON.`,
    onToken,
  });

  const parsed = JSON.parse(extractJsonObject(raw)) as { reply?: unknown };
  const reply = sanitizeReply(readString(parsed.reply));
  if (!reply) throw new Error('Chat reply was empty.');
  return reply;
}
