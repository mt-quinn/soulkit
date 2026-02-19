import type { GeneratedProfile, SchemaField, SchemaPreset } from '@/types';

const NAME_KEY_PREFERENCES = [
  'name',
  'full_name',
  'character_name',
  'contestant_name',
  'display_name',
  'npc_name',
  'person_name',
  'player_name',
  'nickname',
  'alias',
  'callsign',
  'handle',
];

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '_');
}

function scoreSchemaNameField(field: SchemaField): number {
  const key = normalize(field.key);
  const label = normalize(field.label);

  // Display-name fields should be string-like.
  if (field.type !== 'text' && field.type !== 'enum') {
    return -1;
  }

  let score = 0;
  if (NAME_KEY_PREFERENCES.includes(key)) score += 140 - NAME_KEY_PREFERENCES.indexOf(key);
  if (key === 'name') score += 100;
  if (key.endsWith('_name')) score += 80;
  if (key.includes('name')) score += 60;
  if (key.includes('nickname') || key.includes('alias') || key.includes('callsign') || key.includes('handle')) score += 45;
  if (label === 'name') score += 50;
  if (label.includes('name')) score += 35;
  if (field.generationHint === 'identity') score += 20;
  if (field.seedable) score += 10;
  return score;
}

function scoreProfileKey(key: string): number {
  const normalized = normalize(key);
  let score = 0;
  if (NAME_KEY_PREFERENCES.includes(normalized)) score += 120 - NAME_KEY_PREFERENCES.indexOf(normalized);
  if (normalized === 'name') score += 100;
  if (normalized.endsWith('_name')) score += 75;
  if (normalized.includes('name')) score += 55;
  if (normalized.includes('nickname') || normalized.includes('alias') || normalized.includes('callsign') || normalized.includes('handle')) score += 45;
  return score;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function resolveSchemaNameFieldKey(schema: Pick<SchemaPreset, 'fields'> | null | undefined): string | null {
  if (!schema || schema.fields.length === 0) return null;

  const ranked = [...schema.fields]
    .map((field) => ({ key: field.key, score: scoreSchemaNameField(field) }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;
  if (ranked[0].score < 60) return null;
  return ranked[0].key;
}

export function createDefaultNameField(): SchemaField {
  return {
    key: 'name',
    label: 'Name',
    type: 'text',
    description: 'Primary display name for this character/profile.',
    seedable: true,
    generationHint: 'identity',
  };
}

export function ensureSchemaHasReadableNameField(schema: SchemaPreset): SchemaPreset {
  const existingNameKey = resolveSchemaNameFieldKey(schema);
  if (existingNameKey) return schema;

  const nameField = createDefaultNameField();
  const fields = [nameField, ...schema.fields];
  let generationOrder = schema.generationOrder;
  if (generationOrder && generationOrder.length > 0 && !generationOrder.some((pass) => pass.includes('name'))) {
    const firstPass = generationOrder[0] ?? [];
    generationOrder = [['name', ...firstPass], ...generationOrder.slice(1)];
  }

  return {
    ...schema,
    fields,
    generationOrder,
  };
}

export function ensureFieldsHaveReadableNameField(fields: SchemaField[]): SchemaField[] {
  const pseudoSchema: SchemaPreset = {
    id: 'tmp',
    name: 'tmp',
    version: 1,
    fields,
    createdAt: '',
    updatedAt: '',
  };
  return ensureSchemaHasReadableNameField(pseudoSchema).fields;
}

export function resolveProfileDisplayName(
  profileData: Record<string, unknown>,
  options?: { schema?: Pick<SchemaPreset, 'fields'> | null; fallback?: string }
): string {
  const fallback = options?.fallback ?? 'Unnamed Character';
  const preferredKey = resolveSchemaNameFieldKey(options?.schema ?? null);

  if (preferredKey && isNonEmptyString(profileData[preferredKey])) {
    return profileData[preferredKey].trim();
  }

  const rankedKeys = Object.keys(profileData)
    .map((key) => ({ key, score: scoreProfileKey(key), value: profileData[key] }))
    .filter((candidate) => candidate.score > 0 && isNonEmptyString(candidate.value))
    .sort((a, b) => b.score - a.score);

  if (rankedKeys.length > 0) {
    return String(rankedKeys[0].value).trim();
  }

  return fallback;
}

export function resolveProfileNameFieldKey(
  profileData: Record<string, unknown>,
  options?: { schema?: Pick<SchemaPreset, 'fields'> | null }
): string | null {
  const keys = Object.keys(profileData);
  const preferredKey = resolveSchemaNameFieldKey(options?.schema ?? null);
  if (preferredKey) {
    if (preferredKey in profileData) {
      return preferredKey;
    }

    // Some imported/legacy profiles vary key casing/spacing.
    const normalizedPreferred = normalize(preferredKey);
    const normalizedMatch = keys.find((key) => normalize(key) === normalizedPreferred);
    if (normalizedMatch) {
      return normalizedMatch;
    }
  }

  const rankedKeys = keys
    .map((key) => ({ key, score: scoreProfileKey(key) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (rankedKeys.length > 0) {
    return rankedKeys[0].key;
  }

  return preferredKey ?? null;
}

export function resolveGeneratedProfileDisplayName(
  profile: GeneratedProfile,
  options?: { schema?: Pick<SchemaPreset, 'fields'> | null; fallback?: string }
): string {
  return resolveProfileDisplayName(profile.profile, options);
}
