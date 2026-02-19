import type { ConfidenceReport, SchemaField, SchemaPreset } from '@/types';

export interface FieldOption {
  path: string;
  label: string;
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function flattenFieldOptions(fields: SchemaField[], prefixPath = '', prefixLabel = ''): FieldOption[] {
  const result: FieldOption[] = [];
  for (const field of fields) {
    const path = prefixPath ? `${prefixPath}.${field.key}` : field.key;
    const label = prefixLabel ? `${prefixLabel} / ${field.label}` : field.label;
    result.push({ path, label });

    if ((field.type === 'object' || (field.type === 'array' && field.arrayItemType === 'object')) && field.fields?.length) {
      result.push(...flattenFieldOptions(field.fields, path, label));
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getPathValue(object: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let current: unknown = object;
  for (const part of parts) {
    if (!isPlainObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

export function setPathValue(object: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return object;

  const root = cloneJson(object);
  let current: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = current[part];
    if (!isPlainObject(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
  return root;
}

export function rootKeysFromPaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((path) => path.split('.')[0]).filter(Boolean)));
}

export function applyPathSelections(
  base: Record<string, unknown>,
  candidate: Record<string, unknown>,
  selectedPaths: string[]
): Record<string, unknown> {
  if (selectedPaths.length === 0) return cloneJson(candidate);
  let result = cloneJson(base);
  for (const path of selectedPaths) {
    const value = getPathValue(candidate, path);
    if (value !== undefined) {
      result = setPathValue(result, path, value);
    }
  }
  return result;
}

export function enforceLockedPaths(
  base: Record<string, unknown>,
  candidate: Record<string, unknown>,
  lockedPaths: string[]
): Record<string, unknown> {
  if (lockedPaths.length === 0) return candidate;
  let result = cloneJson(candidate);
  for (const path of lockedPaths) {
    const lockedValue = getPathValue(base, path);
    result = setPathValue(result, path, lockedValue);
  }
  return result;
}

export function diffPaths(before: unknown, after: unknown, prefix = ''): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];

  if (Array.isArray(before) && Array.isArray(after)) {
    return [prefix || '$'];
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changes: string[] = [];
    for (const key of keys) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      changes.push(...diffPaths(before[key], after[key], nextPrefix));
    }
    return changes;
  }
  return [prefix || '$'];
}

export function evaluateConfidence(schema: SchemaPreset, profile: Record<string, unknown>, passes = 1): ConfidenceReport {
  const warnings: string[] = [];
  const missing = schema.fields
    .map((field) => field.key)
    .filter((key) => !(key in profile) || profile[key] === null || profile[key] === undefined || profile[key] === '');
  if (missing.length > 0) {
    warnings.push(`Missing or empty top-level fields: ${missing.join(', ')}`);
  }

  const schemaValid = missing.length === 0;
  const fieldsComplete = missing.length === 0;

  return {
    schemaValid,
    fieldsComplete,
    passes,
    warnings,
  };
}
