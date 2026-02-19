import type { LLMProvider, SchemaPreset, MultiPassCallbacks } from '@/types';
import { callOpenAI } from './openai';
import { callAnthropic } from './anthropic';
import { callGemini } from './gemini';
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

type LLMCallFn = (config: {
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  onToken: (token: string) => void;
}) => Promise<string>;

function getCallFn(provider: LLMProvider): LLMCallFn {
  switch (provider) {
    case 'openai': return callOpenAI;
    case 'anthropic': return callAnthropic;
    case 'gemini': return callGemini;
  }
}

/**
 * Generate a profile using either single-pass or multi-pass,
 * depending on whether the schema has generationOrder defined.
 */
export async function generateProfile(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  schema: SchemaPreset,
  seeds: Record<string, unknown>,
  temperature: number,
  callbacks: MultiPassCallbacks
): Promise<void> {
  const callFn = getCallFn(provider);

  if (isMultiPass(schema)) {
    await generateMultiPass(callFn, provider, apiKey, model, schema, seeds, temperature, callbacks);
  } else {
    await generateSinglePass(callFn, provider, apiKey, model, schema, seeds, temperature, callbacks);
  }
}

async function generateSinglePass(
  callFn: LLMCallFn,
  provider: LLMProvider,
  apiKey: string,
  model: string,
  schema: SchemaPreset,
  seeds: Record<string, unknown>,
  temperature: number,
  callbacks: MultiPassCallbacks
): Promise<void> {
  const jsonSchema = buildJsonSchema(schema);
  const systemPrompt = buildSystemPrompt(schema);
  const userPrompt = buildUserPrompt(schema, seeds, jsonSchema);

  callbacks.onPassStart(0, 1, schema.fields.map((f) => f.key));

  try {
    const raw = await callFn({
      apiKey,
      model,
      temperature,
      systemPrompt,
      userPrompt,
      onToken: callbacks.onToken,
    });

    const profile = JSON.parse(raw);
    callbacks.onPassComplete(0, profile);
    callbacks.onComplete({ profile, raw, provider, model });
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'Unknown error');
  }
}

async function generateMultiPass(
  callFn: LLMCallFn,
  provider: LLMProvider,
  apiKey: string,
  model: string,
  schema: SchemaPreset,
  seeds: Record<string, unknown>,
  temperature: number,
  callbacks: MultiPassCallbacks
): Promise<void> {
  const passes = resolveGenerationPasses(schema);
  const accumulatedProfile: Record<string, unknown> = {};
  let allRaw = '';

  try {
    for (let i = 0; i < passes.length; i++) {
      const passFields = passes[i];
      const passKeys = passFields.map((f) => f.key);

      callbacks.onPassStart(i, passes.length, passKeys);

      const passJsonSchema = buildJsonSchemaForFields(passFields);
      const systemPrompt = buildPassSystemPrompt(schema, i, passes.length);
      const userPrompt = buildPassUserPrompt(schema, passFields, passJsonSchema, accumulatedProfile, seeds, i);

      const raw = await callFn({
        apiKey,
        model,
        temperature,
        systemPrompt,
        userPrompt,
        onToken: callbacks.onToken,
      });

      allRaw += (allRaw ? '\n' : '') + raw;

      // Parse this pass's output and merge into accumulated profile
      const passResult = JSON.parse(raw);
      Object.assign(accumulatedProfile, passResult);

      callbacks.onPassComplete(i, { ...accumulatedProfile });
    }

    callbacks.onComplete({
      profile: accumulatedProfile,
      raw: JSON.stringify(accumulatedProfile, null, 2),
      provider,
      model,
    });
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'Unknown error');
  }
}
