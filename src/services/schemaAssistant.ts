import type { SchemaField, SchemaPreset } from '@/types';
import { callOpenAI } from './openai';
import { FIXED_MODEL, FIXED_TEMPERATURE } from './types';
import { ensureFieldsHaveReadableNameField } from '@/lib/profileIdentity';

type LLMCallFn = (config: {
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  onToken: (token: string) => void;
}) => Promise<string>;

export interface SchemaDraft {
  name: string;
  description?: string;
  fields: SchemaField[];
  examples?: Record<string, unknown>[];
  specificity?: SchemaPreset['specificity'];
  generationOrder?: string[][];
}

function buildSuggestTransformsSystemPrompt(): string {
  return `You generate concise one-click transform prompts for schema refinement UX.

Return JSON only:
{
  "transforms": string[]
}

Rules:
- 6 to 10 transforms
- imperative phrasing
- each under 12 words
- specific to selected fields if provided`;
}

function buildRefineFieldsSystemPrompt(): string {
  return `You refine selected top-level schema fields for a character/profile generator.

Return ONE JSON object only in this exact shape:
{
  "fields": SchemaField[]
}

Rules:
- Return ONLY the selected top-level fields.
- Preserve each field key exactly as provided.
- Keep field types valid and internally coherent.
- No markdown, no commentary.`;
}

function buildRefineFieldsUserPrompt(draft: SchemaDraft, selectedKeys: string[], instruction: string): string {
  return `Current schema draft:
\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

Selected top-level fields to regenerate:
${selectedKeys.join(', ')}

Refinement instruction:
${instruction}

Return only {"fields":[...]} for the selected keys.`;
}

function buildRefineWholeUserPrompt(draft: SchemaDraft, instruction: string, lockedKeys: string[]): string {
  return `Current schema draft:
\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

Refinement instruction:
${instruction}
${lockedKeys.length > 0 ? `\nLocked top-level fields (must remain unchanged): ${lockedKeys.join(', ')}` : ''}

Return the full updated schema JSON object.`;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch?.[1]) {
    return codeFenceMatch[1].trim();
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new Error('Model did not return valid JSON.');
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.map((item) => String(item).trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function normalizeField(value: unknown, index: number): SchemaField {
  const src = (value && typeof value === 'object') ? (value as Record<string, unknown>) : {};
  const typeCandidates = new Set([
    'text',
    'number',
    'boolean',
    'enum',
    'array',
    'object',
    'scale',
    'trait-list',
    'references',
    'ranked-likes',
    'ranked-dislikes',
  ]);
  const hintCandidates = new Set(['identity', 'narrative', 'behavioral', 'calibration']);

  const label = typeof src.label === 'string' && src.label.trim()
    ? src.label.trim()
    : `Field ${index + 1}`;
  const key = typeof src.key === 'string' && src.key.trim()
    ? src.key.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    : label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  const type = typeof src.type === 'string' && typeCandidates.has(src.type)
    ? src.type
    : 'text';

  const field: SchemaField = {
    key: key || `field_${index + 1}`,
    label,
    type: type as SchemaField['type'],
    description: typeof src.description === 'string' ? src.description.trim() : '',
    seedable: Boolean(src.seedable),
  };

  if (type === 'enum') field.options = toStringArray(src.options) ?? ['Option 1'];
  if (type === 'scale') field.levels = toStringArray(src.levels) ?? ['Low', 'Medium', 'High'];
  if (type === 'trait-list') {
    const traitCount = Number(src.traitCount);
    field.traitCount = Number.isFinite(traitCount) && traitCount > 0 ? Math.floor(traitCount) : 5;
    if (typeof src.traitConstraint === 'string' && src.traitConstraint.trim()) {
      field.traitConstraint = src.traitConstraint.trim();
    }
  }
  if (type === 'references') {
    const referenceCount = Number(src.referenceCount);
    field.referenceCount = Number.isFinite(referenceCount) && referenceCount > 0 ? Math.floor(referenceCount) : 3;
  }
  if (type === 'ranked-likes' || type === 'ranked-dislikes') {
    const rankedItemCount = Number(src.rankedItemCount);
    field.rankedItemCount = Number.isFinite(rankedItemCount) && rankedItemCount > 0 ? Math.floor(rankedItemCount) : 5;
    if (typeof src.rankedDescriptor === 'string' && src.rankedDescriptor.trim()) {
      field.rankedDescriptor = src.rankedDescriptor.trim();
    } else {
      field.rankedDescriptor = 'things';
    }
  }
  if (type === 'array') {
    const itemType = typeof src.arrayItemType === 'string'
      && ['text', 'number', 'boolean', 'object'].includes(src.arrayItemType)
      ? src.arrayItemType
      : 'text';
    field.arrayItemType = itemType as SchemaField['arrayItemType'];
    if (itemType === 'object') {
      const children = Array.isArray(src.fields) ? src.fields : [];
      field.fields = children.map((child, childIndex) => normalizeField(child, childIndex));
    }
  }
  if (type === 'object') {
    const children = Array.isArray(src.fields) ? src.fields : [];
    field.fields = children.map((child, childIndex) => normalizeField(child, childIndex));
  }
  if (typeof src.generationHint === 'string' && hintCandidates.has(src.generationHint)) {
    field.generationHint = src.generationHint as SchemaField['generationHint'];
  }
  field.dependsOn = toStringArray(src.dependsOn);

  return field;
}

function sanitizeDraft(parsed: unknown): SchemaDraft {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Schema draft must be a JSON object.');
  }
  const src = parsed as Record<string, unknown>;
  const name = typeof src.name === 'string' && src.name.trim() ? src.name.trim() : 'Generated Schema';
  const description = typeof src.description === 'string' && src.description.trim() ? src.description.trim() : undefined;

  const fieldsSource = Array.isArray(src.fields) ? src.fields : [];
  const fields = ensureFieldsHaveReadableNameField(
    fieldsSource.map((field, index) => normalizeField(field, index)).filter((field) => !!field.key)
  );
  if (fields.length === 0) {
    throw new Error('Schema draft contains no usable fields.');
  }

  const topLevelKeys = new Set(fields.map((field) => field.key));
  const specificity =
    src.specificity === 'low' || src.specificity === 'medium' || src.specificity === 'high'
      ? src.specificity
      : undefined;

  const examples = Array.isArray(src.examples)
    ? src.examples.filter((example) => typeof example === 'object' && !!example && !Array.isArray(example)) as Record<string, unknown>[]
    : undefined;

  const generationOrder = Array.isArray(src.generationOrder)
    ? src.generationOrder
      .filter((pass) => Array.isArray(pass))
      .map((pass) => (pass as unknown[]).map((key) => String(key).trim()).filter((key) => topLevelKeys.has(key)))
      .filter((pass) => pass.length > 0)
    : undefined;

  return {
    name,
    description,
    fields,
    examples: examples && examples.length > 0 ? examples : undefined,
    specificity,
    generationOrder: generationOrder && generationOrder.length > 0 ? generationOrder : undefined,
  };
}

export function parseSchemaDraft(input: unknown): SchemaDraft {
  return sanitizeDraft(input);
}

function sanitizeFieldPatch(parsed: unknown): SchemaField[] {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const src = parsed as Record<string, unknown>;
  const fieldsSource = Array.isArray(src.fields) ? src.fields : [];
  return fieldsSource
    .map((field, index) => normalizeField(field, index))
    .filter((field) => !!field.key);
}

function buildSystemPrompt(): string {
  return `You design production-ready JSON schemas for LLM-driven character/profile generation tools.

Return ONE JSON object only. No markdown, no commentary.

Allowed field types:
- text
- number
- boolean
- enum (use "options")
- scale (use ordered "levels")
- trait-list (use "traitCount" and optional "traitConstraint")
- references (use "referenceCount")
- ranked-likes (use "rankedItemCount" and optional "rankedDescriptor")
- ranked-dislikes (use "rankedItemCount" and optional "rankedDescriptor")
- array (use "arrayItemType", and "fields" when arrayItemType is object)
- object (use nested "fields")

Each field must include:
- key
- label
- type
- description
- seedable (boolean)

Advanced metadata to include where useful:
- generationHint: one of identity | narrative | behavioral | calibration
- dependsOn: array of field keys

Top-level output shape:
{
  "name": string,
  "description": string,
  "specificity": "low" | "medium" | "high",
  "generationOrder": string[][],
  "examples": object[],
  "fields": SchemaField[]
}

Rules:
- Build a complete, internally coherent schema.
- Prefer practical fields over novelty.
- Optimize for LLM agent runtime efficiency: be broad and brief.
- Default to fewer, higher-leverage fields instead of many narrow fields.
- Target 6-10 top-level fields by default.
- Hard cap at 12 top-level fields unless the user explicitly asks for more.
- Avoid micro-fields that overfit minor details.
- Merge closely related concepts into one field when possible.
- Keep field descriptions concise (usually one short sentence).
- Default specificity to low or medium unless the user explicitly requests very high detail.
- Include examples only when they materially help; keep them brief and sparse.
- For ranked-likes/ranked-dislikes, expect output as explicit numbered arrays (e.g., "1. ...", "2. ...").
- Include at least one top-level readable display-name field (e.g., "name" or "contestant_name"), type text.
- generationOrder must only reference top-level field keys.`;
}

function buildUserPrompt(goal: string): string {
  return `Create a schema based on this user goal:

${goal.trim()}

Bias toward broad, compact schema design unless the goal explicitly asks for granularity.
If the goal does not specify field count, aim for about 8 top-level fields.

Return only the JSON object in the required shape.`;
}

export async function generateSchemaDraft(config: {
  apiKey: string;
  goal: string;
  onToken: (token: string) => void;
}): Promise<SchemaDraft> {
  const raw = await (callOpenAI as LLMCallFn)({
    apiKey: config.apiKey,
    model: FIXED_MODEL,
    temperature: FIXED_TEMPERATURE,
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(config.goal),
    onToken: config.onToken,
  });

  const json = extractJsonObject(raw);
  const parsed = JSON.parse(json);
  const draft = sanitizeDraft(parsed);
  return {
    ...draft,
    specificity: draft.specificity ?? 'low',
  };
}

export async function refineSchemaDraft(config: {
  apiKey: string;
  draft: SchemaDraft;
  instruction: string;
  selectedFieldKeys: string[];
  lockedFieldKeys: string[];
  onToken: (token: string) => void;
}): Promise<SchemaDraft> {
  const selected = Array.from(new Set(config.selectedFieldKeys)).filter(Boolean);
  const locked = Array.from(new Set(config.lockedFieldKeys)).filter(Boolean);

  if (selected.length === 0) {
    const raw = await (callOpenAI as LLMCallFn)({
      apiKey: config.apiKey,
      model: FIXED_MODEL,
      temperature: FIXED_TEMPERATURE,
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildRefineWholeUserPrompt(config.draft, config.instruction, locked),
      onToken: config.onToken,
    });
    const json = extractJsonObject(raw);
    const updated = sanitizeDraft(JSON.parse(json));

    if (locked.length === 0) {
      return {
        ...updated,
        specificity: updated.specificity ?? config.draft.specificity ?? 'low',
      };
    }
    const lockSet = new Set(locked);
    const sourceByKey = new Map(config.draft.fields.map((field) => [field.key, field]));
    const mergedFields = updated.fields.map((field) => (lockSet.has(field.key) ? (sourceByKey.get(field.key) ?? field) : field));
    return {
      ...updated,
      fields: mergedFields,
      specificity: updated.specificity ?? config.draft.specificity ?? 'low',
    };
  }

  const raw = await (callOpenAI as LLMCallFn)({
    apiKey: config.apiKey,
    model: FIXED_MODEL,
    temperature: FIXED_TEMPERATURE,
    systemPrompt: buildRefineFieldsSystemPrompt(),
    userPrompt: `${buildRefineFieldsUserPrompt(config.draft, selected, config.instruction)}${locked.length > 0 ? `\nLocked fields that must remain unchanged if returned: ${locked.join(', ')}` : ''}`,
    onToken: config.onToken,
  });
  const json = extractJsonObject(raw);
  const patches = sanitizeFieldPatch(JSON.parse(json));

  if (patches.length === 0) {
    return config.draft;
  }

  const patchMap = new Map(patches.map((field) => [field.key, field]));
  const lockSet = new Set(locked);
  const updatedFields = config.draft.fields.map((field) => {
    if (lockSet.has(field.key)) return field;
    return patchMap.get(field.key) ?? field;
  });

  return {
    ...config.draft,
    fields: ensureFieldsHaveReadableNameField(updatedFields),
    specificity: config.draft.specificity ?? 'low',
  };
}

export async function suggestSchemaTransforms(config: {
  apiKey: string;
  draft: SchemaDraft;
  selectedFieldKeys: string[];
}): Promise<string[]> {
  const selected = Array.from(new Set(config.selectedFieldKeys)).filter(Boolean);
  const raw = await (callOpenAI as LLMCallFn)({
    apiKey: config.apiKey,
    model: FIXED_MODEL,
    temperature: 0.7,
    systemPrompt: buildSuggestTransformsSystemPrompt(),
    userPrompt: `Schema draft:\n\`\`\`json\n${JSON.stringify(config.draft, null, 2)}\n\`\`\`\n\n${selected.length > 0 ? `Selected fields: ${selected.join(', ')}` : 'No selected fields. Suggest whole-schema transforms.'}\n\nReturn only JSON.`,
    onToken: () => {},
  });
  const json = extractJsonObject(raw);
  const parsed = JSON.parse(json) as { transforms?: unknown };
  if (!Array.isArray(parsed.transforms)) return [];
  return parsed.transforms
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 10);
}
