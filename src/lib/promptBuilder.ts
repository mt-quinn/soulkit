import type { SchemaPreset, SchemaField, GenerationHint } from '@/types';

// ============================================================
// JSON Schema conversion (per-field)
// ============================================================

function fieldToJsonSchema(field: SchemaField): Record<string, unknown> {
  const desc = field.description || field.label;

  switch (field.type) {
    case 'text':
      return { type: 'string', description: desc };
    case 'number':
      return { type: 'number', description: desc };
    case 'boolean':
      return { type: 'boolean', description: desc };
    case 'enum':
      return { type: 'string', enum: field.options ?? [], description: desc };
    case 'scale':
      return { type: 'string', enum: field.levels ?? [], description: `${desc} (ordered scale: ${(field.levels ?? []).join(' → ')})` };
    case 'trait-list':
      return { type: 'string', description: `${desc} — a comma-separated list of exactly ${field.traitCount ?? 5} ${field.traitConstraint ?? 'descriptive adjectives'}` };
    case 'references':
      return { type: 'string', description: `${desc} — ${field.referenceCount ?? 3} well-known fictional/real characters in "Name (Source)" format, comma-separated` };
    case 'array': {
      if (field.arrayItemType === 'object' && field.fields?.length) {
        return { type: 'array', items: fieldsToObjectSchema(field.fields), description: desc };
      }
      const itemType = field.arrayItemType === 'number' ? 'number' : field.arrayItemType === 'boolean' ? 'boolean' : 'string';
      return { type: 'array', items: { type: itemType }, description: desc };
    }
    case 'object':
      return { ...fieldsToObjectSchema(field.fields ?? []), description: desc };
    default:
      return { type: 'string', description: desc };
  }
}

function fieldsToObjectSchema(fields: SchemaField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of fields) {
    properties[field.key] = fieldToJsonSchema(field);
    required.push(field.key);
  }
  return { type: 'object', properties, required };
}

/** Build JSON schema for the full profile */
export function buildJsonSchema(schema: SchemaPreset): Record<string, unknown> {
  return fieldsToObjectSchema(schema.fields);
}

/** Build JSON schema for a subset of fields (used in multi-pass) */
export function buildJsonSchemaForFields(fields: SchemaField[]): Record<string, unknown> {
  return fieldsToObjectSchema(fields);
}

// ============================================================
// Specificity instructions
// ============================================================

const SPECIFICITY_INSTRUCTIONS: Record<string, string> = {
  low: 'Use broad strokes and general descriptions. Keep details light and flexible.',
  medium: 'Include specific details and concrete examples where appropriate. Balance between broad strokes and sharp detail.',
  high: `Be extremely specific and concrete. Instead of "had a bad experience," write "a catastrophic misjudgment during a high-pressure surgery resulted in a patient's death and a subsequent lawsuit." Every detail should be vivid, particular, and memorable. No generic filler.`,
};

// ============================================================
// Generation hint instructions (injected per-field context)
// ============================================================

const HINT_INSTRUCTIONS: Record<GenerationHint, string> = {
  identity: 'This is a core identity field. Make it distinctive, memorable, and immediately evocative of the character.',
  narrative: 'This is a narrative field. Write a concise paragraph (3-4 sentences max) with causal depth — include a specific inciting incident or turning point that explains who this character is now. Be dense and vivid, not verbose.',
  behavioral: 'This is a behavioral instruction field. The output will be used as a direct instruction for how an LLM agent should behave. Write it as an actionable directive, not a description. Example: "Retreats into technical medical language when stressed" rather than "Gets nervous sometimes."',
  calibration: 'This is a calibration field. Select well-known fictional or real characters whose personality, communication style, and energy closely match this character. These serve as reference points that an LLM can use to calibrate behavior.',
};

// ============================================================
// Single-pass prompt building (backward compatible)
// ============================================================

export function buildSystemPrompt(schema: SchemaPreset): string {
  const specificity = schema.specificity ?? 'high';
  return `You are a creative character profile generator specialized in creating LLM agent personality profiles. Your task is to generate a detailed, original, and internally consistent character profile.

You MUST respond with valid JSON that exactly matches the provided schema. Do not include any text outside the JSON object.

QUALITY RULES:
- Every field must be internally consistent with every other field. Traits, backstory, quirks, and descriptions must all reinforce the same coherent identity.
- ${SPECIFICITY_INSTRUCTIONS[specificity]}
- Avoid clichés and generic filler. Every word should earn its place.
- For personality traits/scales: understand that these form an interconnected system. A character who is "Quiet" on Chattiness is unlikely to be "Redirective" on Steering. Make trait selections that form a coherent personality.
- For backstory/narrative fields: include a specific wound, turning point, or conflict that causally explains the character's current personality.
- For behavioral instruction fields (quirks, etc.): produce actionable LLM directives, not vague descriptions.

Schema name: ${schema.name}
${schema.description ? `Schema description: ${schema.description}` : ''}`;
}

export function buildUserPrompt(
  schema: SchemaPreset,
  seeds: Record<string, unknown>,
  jsonSchema: Record<string, unknown>
): string {
  const hasSeedValues = Object.keys(seeds).length > 0;

  let prompt = `Generate a character profile matching this JSON Schema:\n\n\`\`\`json\n${JSON.stringify(jsonSchema, null, 2)}\n\`\`\`\n`;

  // Add field-level generation hints
  const hintAnnotations = collectHintAnnotations(schema.fields);
  if (hintAnnotations.length > 0) {
    prompt += `\nField generation guidance:\n${hintAnnotations.join('\n')}\n`;
  }

  // Add few-shot examples
  if (schema.examples && schema.examples.length > 0) {
    prompt += `\nHere are examples of the quality and style expected:\n`;
    schema.examples.forEach((example, i) => {
      prompt += `\n=== Example ${i + 1} ===\n${JSON.stringify(example, null, 2)}\n`;
    });
    prompt += `\nGenerate a NEW profile at this same level of quality. Do not copy or closely imitate the examples — create something original.\n`;
  }

  if (hasSeedValues) {
    prompt += `\nThe following values are FIXED and must be used exactly as provided:\n\n\`\`\`json\n${JSON.stringify(seeds, null, 2)}\n\`\`\`\n`;
    prompt += `\nGenerate all remaining fields creatively, ensuring deep consistency with the provided seed values.\n`;
  } else {
    prompt += `\nGenerate all fields with creative, original content. Make the character unique and interesting.\n`;
  }

  prompt += `\nRespond with ONLY the JSON object. No additional text, explanations, or markdown formatting.`;
  return prompt;
}

// ============================================================
// Multi-pass prompt building
// ============================================================

/**
 * Build system prompt for a specific pass in multi-pass generation.
 */
export function buildPassSystemPrompt(schema: SchemaPreset, passIndex: number, totalPasses: number): string {
  const specificity = schema.specificity ?? 'high';
  return `You are a creative character profile generator building a profile in stages. This is pass ${passIndex + 1} of ${totalPasses}.

You MUST respond with valid JSON containing ONLY the fields requested. Do not include any text outside the JSON object.

QUALITY RULES:
- ${SPECIFICITY_INSTRUCTIONS[specificity]}
- Every field must be internally consistent with all previously established fields.
- Avoid clichés and generic filler. Be specific, vivid, and original.

Schema name: ${schema.name}
${schema.description ? `Schema description: ${schema.description}` : ''}`;
}

/**
 * Build user prompt for a specific pass in multi-pass generation.
 * Receives the accumulated profile from previous passes as context.
 */
export function buildPassUserPrompt(
  schema: SchemaPreset,
  passFields: SchemaField[],
  passJsonSchema: Record<string, unknown>,
  priorOutput: Record<string, unknown>,
  seeds: Record<string, unknown>,
  passIndex: number
): string {
  const hasPrior = Object.keys(priorOutput).length > 0;
  const hasSeedValues = Object.keys(seeds).length > 0;

  let prompt = '';

  // Context from previous passes
  if (hasPrior) {
    prompt += `The following fields have already been established for this character:\n\n\`\`\`json\n${JSON.stringify(priorOutput, null, 2)}\n\`\`\`\n\n`;
  }

  // Few-shot examples (only on first pass to save tokens, or include a trimmed version)
  if (passIndex === 0 && schema.examples && schema.examples.length > 0) {
    prompt += `Here are complete example profiles showing the target quality level:\n`;
    schema.examples.forEach((example, i) => {
      prompt += `\n=== Example ${i + 1} ===\n${JSON.stringify(example, null, 2)}\n`;
    });
    prompt += `\nCreate something original at this quality level. Do not copy or imitate the examples.\n\n`;
  }

  // The fields to generate in this pass
  prompt += `Now generate ONLY the following fields as a JSON object:\n\n\`\`\`json\n${JSON.stringify(passJsonSchema, null, 2)}\n\`\`\`\n`;

  // Field-level generation hints for this pass
  const hintAnnotations = collectHintAnnotations(passFields);
  if (hintAnnotations.length > 0) {
    prompt += `\nField generation guidance:\n${hintAnnotations.join('\n')}\n`;
  }

  // Pass-specific instructions based on what kinds of fields are in this pass
  const hints = new Set(passFields.map((f) => f.generationHint).filter(Boolean));

  if (hints.has('identity')) {
    prompt += `\nFor identity fields: make names distinctive and memorable. Archetypes should be a concise "The [Adjective] [Noun]" pattern.\n`;
  }
  if (hints.has('narrative') && hasPrior) {
    prompt += `\nFor narrative fields: keep backstories to ONE short paragraph (3-4 sentences). The backstory must EXPLAIN and CAUSALLY JUSTIFY the traits already established above — include a specific inciting incident or turning point. Be dense and vivid, not verbose. The description should be 2-3 sentences.\n`;
  }
  if (hints.has('behavioral') && hasPrior) {
    prompt += `\nFor behavioral fields: produce actionable directives that an LLM agent could follow. Each should be a concrete behavior pattern, not a vague personality trait. Example: "Retreats into technical jargon when stressed" rather than "Gets nervous."\n`;
  }
  if (hints.has('calibration') && hasPrior) {
    prompt += `\nFor calibration fields: select well-known fictional characters whose personality and energy closely match the profile established above. Format as "Name (Source)" and choose references that would help an LLM calibrate the right tone and style.\n`;
  }

  // Seeds that apply to this pass
  const passKeys = new Set(passFields.map((f) => f.key));
  const passSeeds: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(seeds)) {
    if (passKeys.has(key)) {
      passSeeds[key] = value;
    }
  }
  if (Object.keys(passSeeds).length > 0) {
    prompt += `\nThe following values are FIXED for this pass and must be used exactly:\n\n\`\`\`json\n${JSON.stringify(passSeeds, null, 2)}\n\`\`\`\n`;
  }

  prompt += `\nRespond with ONLY the JSON object containing the requested fields. No additional text.`;
  return prompt;
}

// ============================================================
// Helpers
// ============================================================

function collectHintAnnotations(fields: SchemaField[], prefix = ''): string[] {
  const annotations: string[] = [];
  for (const field of fields) {
    const key = prefix ? `${prefix}.${field.key}` : field.key;
    if (field.generationHint) {
      annotations.push(`- "${key}": ${HINT_INSTRUCTIONS[field.generationHint]}`);
    }
    if (field.dependsOn && field.dependsOn.length > 0) {
      annotations.push(`- "${key}": Must be causally derived from and consistent with: ${field.dependsOn.join(', ')}`);
    }
    if (field.type === 'object' && field.fields) {
      annotations.push(...collectHintAnnotations(field.fields, key));
    }
  }
  return annotations;
}

/**
 * Resolve generationOrder field keys to actual SchemaField objects.
 * Returns array of passes, each being an array of SchemaFields.
 */
export function resolveGenerationPasses(schema: SchemaPreset): SchemaField[][] {
  if (!schema.generationOrder || schema.generationOrder.length === 0) {
    // No multi-pass: single pass with all fields
    return [schema.fields];
  }

  const fieldMap = new Map<string, SchemaField>();
  for (const field of schema.fields) {
    fieldMap.set(field.key, field);
  }

  const passes: SchemaField[][] = [];
  const assigned = new Set<string>();

  for (const passKeys of schema.generationOrder) {
    const passFields: SchemaField[] = [];
    for (const key of passKeys) {
      const field = fieldMap.get(key);
      if (field) {
        passFields.push(field);
        assigned.add(key);
      }
    }
    if (passFields.length > 0) {
      passes.push(passFields);
    }
  }

  // Any fields not in generationOrder go in a final pass
  const remaining = schema.fields.filter((f) => !assigned.has(f.key));
  if (remaining.length > 0) {
    passes.push(remaining);
  }

  return passes;
}

/**
 * Check if a schema should use multi-pass generation.
 */
export function isMultiPass(schema: SchemaPreset): boolean {
  return !!schema.generationOrder && schema.generationOrder.length > 1;
}
