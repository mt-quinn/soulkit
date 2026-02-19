import type { SchemaPreset, SchemaField, GenerationHint } from '@/types';

// ============================================================
// JSON Schema conversion (per-field)
// ============================================================

function fieldToJsonSchema(field: SchemaField): Record<string, unknown> {
  const desc = field.description || field.label;

  switch (field.type) {
    case 'text':
      return {
        type: 'string',
        description: `${desc} (Default length: one concise sentence or short phrase. Keep under 25 words unless explicitly requested otherwise.)`,
      };
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
    case 'ranked-likes': {
      const count = field.rankedItemCount ?? 5;
      const descriptor = field.rankedDescriptor ?? 'things';
      return {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: { type: 'string' },
        description: `${desc} — ranked likes for ${descriptor}. Return exactly ${count} entries, each explicitly numbered like "1. ...", "2. ...", ranked strongest to weakest.`,
      };
    }
    case 'ranked-dislikes': {
      const count = field.rankedItemCount ?? 5;
      const descriptor = field.rankedDescriptor ?? 'things';
      return {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: { type: 'string' },
        description: `${desc} — ranked dislikes for ${descriptor}. Return exactly ${count} entries, each explicitly numbered like "1. ...", "2. ...", ranked strongest to weakest.`,
      };
    }
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
  low: 'Use broad strokes and general descriptions. Keep details light, brief, and flexible.',
  medium: 'Use concise, concrete details where needed. Prioritize clarity and brevity over depth.',
  high: `Be extremely specific and concrete. Instead of "had a bad experience," write "a catastrophic misjudgment during a high-pressure surgery resulted in a patient's death and a subsequent lawsuit." Every detail should be vivid, particular, and memorable. No generic filler.`,
};

// ============================================================
// Generation hint instructions (injected per-field context)
// ============================================================

const HINT_INSTRUCTIONS: Record<GenerationHint, string> = {
  identity: 'This is a core identity field. Make it distinctive, memorable, and immediately evocative of the character.',
  narrative: 'This is a narrative field. Write 1-2 concise sentences with causal depth — include a specific turning point that explains who this character is now.',
  behavioral: 'This is a behavioral instruction field. The output will be used as a direct instruction for how an LLM agent should behave. Write it as an actionable directive, not a description. Example: "Retreats into technical medical language when stressed" rather than "Gets nervous sometimes."',
  calibration: 'This is a calibration field. Select well-known fictional or real characters whose personality, communication style, and energy closely match this character. These serve as reference points that an LLM can use to calibrate behavior.',
};

// ============================================================
// Single-pass prompt building (backward compatible)
// ============================================================

export function buildSystemPrompt(schema: SchemaPreset): string {
  const specificity = schema.specificity ?? 'low';
  return `You are a creative character profile generator specialized in creating LLM agent personality profiles. Your task is to generate a concise, original, and internally consistent character profile.

You MUST respond with valid JSON that exactly matches the provided schema. Do not include any text outside the JSON object.

QUALITY RULES:
- Every field must be internally consistent with every other field. Traits, backstory, quirks, and descriptions must all reinforce the same coherent identity.
- ${SPECIFICITY_INSTRUCTIONS[specificity]}
- Brevity first: prefer short, information-dense outputs over long prose.
- For most text fields, use one sentence or a short phrase.
- For narrative/description fields, use 1-2 sentences unless the user explicitly requests depth.
- Length limits by default: most text fields <= 25 words; narrative/description fields <= 45 words.
- Avoid repeating the same idea across multiple fields.
- Avoid clichés and generic filler. Every word should earn its place.
- For personality traits/scales: understand that these form an interconnected system. A character who is "Quiet" on Chattiness is unlikely to be "Redirective" on Steering. Make trait selections that form a coherent personality.
- For backstory/narrative fields: include a specific wound, turning point, or conflict that causally explains the character's current personality.
- For behavioral instruction fields (quirks, etc.): produce actionable LLM directives, not vague descriptions.

Schema name: ${schema.name}
${schema.description ? `Schema description: ${schema.description}` : ''}`;
}

export function buildUserPrompt(
  schema: SchemaPreset,
  userInput: string,
  jsonSchema: Record<string, unknown>
): string {
  const brief = userInput.trim();
  const hasBrief = brief.length > 0;
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

  if (hasBrief) {
    prompt += `\nUser brief (the character must satisfy this brief):\n${brief}\n`;
    prompt += `\nInterpret the brief and fill ALL schema fields, even if the user does not mention each one explicitly.`;
    prompt += `\nDo not ask follow-up questions. Infer reasonable details while staying faithful to the brief.\n`;
    prompt += `\nDefault to concise output. Keep text fields brief unless the brief explicitly asks for longer prose.\n`;
  } else {
    prompt += `\nNo user brief was provided. Generate a random, original character that still fits this schema and remains internally consistent.\n`;
    prompt += `\nDo not ask follow-up questions. Make decisive choices and fill ALL schema fields.\n`;
    prompt += `\nDefault to concise output.\n`;
  }
  prompt += `\nIf schema descriptions contain broad length ranges, treat those as maximums and prefer the shortest high-quality answer.\n`;

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
  const specificity = schema.specificity ?? 'low';
  return `You are a creative character profile generator building a profile in stages. This is pass ${passIndex + 1} of ${totalPasses}.

You MUST respond with valid JSON containing ONLY the fields requested. Do not include any text outside the JSON object.

QUALITY RULES:
- ${SPECIFICITY_INSTRUCTIONS[specificity]}
- Every field must be internally consistent with all previously established fields.
- Brevity first: prefer compact outputs over long prose.
- For most text fields, use one sentence or a short phrase.
- For narrative/description fields, use 1-2 sentences unless explicitly requested otherwise.
- Length limits by default: most text fields <= 25 words; narrative/description fields <= 45 words.
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
  userInput: string,
  passIndex: number
): string {
  const brief = userInput.trim();
  const hasBrief = brief.length > 0;
  const hasPrior = Object.keys(priorOutput).length > 0;

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
  if (hasBrief) {
    prompt += `\nUser brief:\n${brief}\n`;
  } else {
    prompt += `\nNo user brief was provided. Continue generating a random, original character that fits the schema and remains consistent with prior fields.\n`;
  }

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
    prompt += `\nFor narrative fields: keep backstories to 1-2 sentences. They must EXPLAIN and CAUSALLY JUSTIFY traits already established above with a specific turning point. Description fields should be 1-2 sentences.\n`;
  }
  if (hints.has('behavioral') && hasPrior) {
    prompt += `\nFor behavioral fields: produce actionable directives that an LLM agent could follow. Each should be a concrete behavior pattern, not a vague personality trait. Example: "Retreats into technical jargon when stressed" rather than "Gets nervous."\n`;
  }
  if (hints.has('calibration') && hasPrior) {
    prompt += `\nFor calibration fields: select well-known fictional characters whose personality and energy closely match the profile established above. Format as "Name (Source)" and choose references that would help an LLM calibrate the right tone and style.\n`;
  }

  prompt += hasBrief
    ? '\nInterpret the brief and prior fields to infer any missing detail while keeping strong internal consistency.\n'
    : '\nInterpret prior fields to infer any missing detail while keeping strong internal consistency.\n';
  prompt += `\nDefault to concise outputs: most text fields under 25 words; narrative/description fields under 45 words${hasBrief ? ' unless the brief explicitly asks for more' : ''}.\n`;

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
