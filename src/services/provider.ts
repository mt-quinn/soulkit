import type { SchemaPreset, MultiPassCallbacks } from '@/types';
import { callOpenAI } from './openai';
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildJsonSchema,
  buildPassSystemPrompt,
  buildPassUserPrompt,
  buildJsonSchemaForFields,
  resolveGenerationPasses,
  isMultiPass,
} from '@/lib/promptBuilder';
import { FIXED_MODEL, FIXED_PROVIDER, FIXED_TEMPERATURE } from './types';
import type { GenerationResult, SchemaField } from '@/types';
import { enforceLockedPaths } from '@/lib/workspace';

type LLMCallFn = (config: {
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  onToken: (token: string) => void;
}) => Promise<string>;

function rootFieldKeys(fieldPaths: string[]): string[] {
  return Array.from(new Set(fieldPaths.map((path) => path.split('.')[0]).filter(Boolean)));
}

function resolveTargetFields(schema: SchemaPreset, fieldPaths: string[]): SchemaField[] {
  const keys = rootFieldKeys(fieldPaths);
  if (keys.length === 0) return schema.fields;
  const matched = schema.fields.filter((field) => keys.includes(field.key));
  return matched.length > 0 ? matched : schema.fields;
}

function buildRefineSystemPrompt(schema: SchemaPreset, partial: boolean): string {
  return `You are refining an existing character profile while preserving internal consistency and schema correctness.

You MUST respond with valid JSON only.
${partial ? 'Return ONLY the requested fields.' : 'Return the complete profile object.'}
- Keep revisions concise by default. Do not expand text unless asked.
- For most text fields, use one sentence or a short phrase.
- For narrative/description fields, keep to 1-2 sentences unless instruction explicitly asks for more.
- Length limits by default: most text fields <= 25 words; narrative/description fields <= 45 words.

Schema name: ${schema.name}
${schema.description ? `Schema description: ${schema.description}` : ''}`;
}

function buildRefineUserPrompt(config: {
  schema: SchemaPreset;
  currentProfile: Record<string, unknown>;
  originalBrief?: string;
  instruction: string;
  targetJsonSchema: Record<string, unknown>;
  selectedRootKeys: string[];
  lockedFieldPaths: string[];
  constraintProfile?: Record<string, unknown>;
  partial: boolean;
}): string {
  const { schema, currentProfile, originalBrief, instruction, targetJsonSchema, selectedRootKeys, lockedFieldPaths, constraintProfile, partial } = config;
  return `Current profile:
\`\`\`json
${JSON.stringify(currentProfile, null, 2)}
\`\`\`

${originalBrief ? `Original user brief:\n${originalBrief}\n` : ''}
Refinement instruction:
${instruction}

${partial
    ? `Regenerate ONLY these top-level fields: ${selectedRootKeys.join(', ')}`
    : 'Regenerate the full profile.'}
${lockedFieldPaths.length > 0 ? `\nLocked fields (must remain unchanged): ${lockedFieldPaths.join(', ')}` : ''}
${constraintProfile ? `\nUse these inline workspace edits as hard constraints:\n\`\`\`json\n${JSON.stringify(constraintProfile, null, 2)}\n\`\`\`` : ''}

Target JSON schema:
\`\`\`json
${JSON.stringify(targetJsonSchema, null, 2)}
\`\`\`

${schema.examples && schema.examples.length > 0 ? `Reference examples:\n${schema.examples.map((example, i) => `Example ${i + 1}:\n${JSON.stringify(example, null, 2)}`).join('\n\n')}\n` : ''}

Default output style: concise and information-dense.
If schema descriptions include broad length ranges, treat them as maximums and prefer shorter outputs.

Respond with ONLY the requested JSON object.`;
}

/**
 * Generate a profile using either single-pass or multi-pass,
 * depending on whether the schema has generationOrder defined.
 */
export async function generateProfile(
  apiKey: string,
  schema: SchemaPreset,
  userInput: string,
  callbacks: MultiPassCallbacks
): Promise<void> {
  const callFn = callOpenAI;

  if (isMultiPass(schema)) {
    await generateMultiPass(callFn, apiKey, schema, userInput, callbacks);
  } else {
    await generateSinglePass(callFn, apiKey, schema, userInput, callbacks);
  }
}

/**
 * Refine either selected root fields or a full profile.
 * If selectedFieldPaths is empty, regenerates the full profile.
 */
export async function refineProfile(
  apiKey: string,
  schema: SchemaPreset,
  currentProfile: Record<string, unknown>,
  originalBrief: string | undefined,
  instruction: string,
  selectedFieldPaths: string[],
  lockedFieldPaths: string[],
  constraintProfile: Record<string, unknown> | undefined,
  onToken: (token: string) => void
): Promise<GenerationResult> {
  const targetFields = resolveTargetFields(schema, selectedFieldPaths);
  const selectedKeys = rootFieldKeys(selectedFieldPaths);
  const partial = selectedKeys.length > 0;
  const targetSchema = buildJsonSchemaForFields(targetFields);

  const raw = await callOpenAI({
    apiKey,
    model: FIXED_MODEL,
    temperature: FIXED_TEMPERATURE,
    systemPrompt: buildRefineSystemPrompt(schema, partial),
    userPrompt: buildRefineUserPrompt({
      schema,
      currentProfile,
      originalBrief,
      instruction,
      targetJsonSchema: targetSchema,
      selectedRootKeys: selectedKeys,
      lockedFieldPaths,
      constraintProfile,
      partial,
    }),
    onToken,
  });

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const merged = partial ? { ...currentProfile, ...parsed } : parsed;
  const profile = enforceLockedPaths(currentProfile, merged, lockedFieldPaths);
  return {
    profile,
    raw,
    provider: FIXED_PROVIDER,
    model: FIXED_MODEL,
  };
}

export async function suggestProfileTransforms(
  apiKey: string,
  schema: SchemaPreset,
  currentProfile: Record<string, unknown>,
  selectedFieldPaths: string[],
  onToken?: (token: string) => void
): Promise<string[]> {
  const selectedKeys = rootFieldKeys(selectedFieldPaths);
  const raw = await callOpenAI({
    apiKey,
    model: FIXED_MODEL,
    temperature: 0.7,
    systemPrompt: `You generate concise one-click prompt transforms for profile refinement UX.

Return JSON only:
{
  "transforms": string[]
}

Rules:
- Provide 6 to 10 transforms.
- Each transform must be an imperative prompt fragment.
- Keep each under 12 words.
- Make transforms specific to the selected field context when fields are provided.`,
    userPrompt: `Schema:
\`\`\`json
${JSON.stringify({ name: schema.name, fields: schema.fields }, null, 2)}
\`\`\`

Current profile:
\`\`\`json
${JSON.stringify(currentProfile, null, 2)}
\`\`\`

${selectedKeys.length > 0
  ? `Selected top-level fields: ${selectedKeys.join(', ')}`
  : 'No selected fields. Provide whole-profile transforms.'}

Return only JSON.`,
    onToken: onToken ?? (() => {}),
  });

  const parsed = JSON.parse(raw) as { transforms?: unknown };
  if (!parsed.transforms || !Array.isArray(parsed.transforms)) return [];
  return parsed.transforms
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 10);
}

async function generateSinglePass(
  callFn: LLMCallFn,
  apiKey: string,
  schema: SchemaPreset,
  userInput: string,
  callbacks: MultiPassCallbacks
): Promise<void> {
  const jsonSchema = buildJsonSchema(schema);
  const systemPrompt = buildSystemPrompt(schema);
  const userPrompt = buildUserPrompt(schema, userInput, jsonSchema);

  callbacks.onPassStart(0, 1, schema.fields.map((f) => f.key));

  try {
    const raw = await callFn({
      apiKey,
      model: FIXED_MODEL,
      temperature: FIXED_TEMPERATURE,
      systemPrompt,
      userPrompt,
      onToken: callbacks.onToken,
    });

    const profile = JSON.parse(raw);
    callbacks.onPassComplete(0, profile);
    callbacks.onComplete({ profile, raw, provider: FIXED_PROVIDER, model: FIXED_MODEL });
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'Unknown error');
  }
}

async function generateMultiPass(
  callFn: LLMCallFn,
  apiKey: string,
  schema: SchemaPreset,
  userInput: string,
  callbacks: MultiPassCallbacks
): Promise<void> {
  const passes = resolveGenerationPasses(schema);
  const accumulatedProfile: Record<string, unknown> = {};

  try {
    for (let i = 0; i < passes.length; i++) {
      const passFields = passes[i];
      const passKeys = passFields.map((f) => f.key);

      callbacks.onPassStart(i, passes.length, passKeys);

      const passJsonSchema = buildJsonSchemaForFields(passFields);
      const systemPrompt = buildPassSystemPrompt(schema, i, passes.length);
      const userPrompt = buildPassUserPrompt(schema, passFields, passJsonSchema, accumulatedProfile, userInput, i);

      const raw = await callFn({
        apiKey,
        model: FIXED_MODEL,
        temperature: FIXED_TEMPERATURE,
        systemPrompt,
        userPrompt,
        onToken: callbacks.onToken,
      });

      // Parse this pass's output and merge into accumulated profile
      const passResult = JSON.parse(raw);
      Object.assign(accumulatedProfile, passResult);

      callbacks.onPassComplete(i, { ...accumulatedProfile });
    }

    callbacks.onComplete({
      profile: accumulatedProfile,
      raw: JSON.stringify(accumulatedProfile, null, 2),
      provider: FIXED_PROVIDER,
      model: FIXED_MODEL,
    });
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'Unknown error');
  }
}
