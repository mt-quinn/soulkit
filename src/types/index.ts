// ============================================================
// Field Types & Schema
// ============================================================

export type FieldType = 'text' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'scale' | 'trait-list' | 'references';

export type GenerationHint = 'identity' | 'narrative' | 'behavioral' | 'calibration';

export interface SchemaField {
  key: string;
  label: string;
  type: FieldType;
  description: string;
  seedable: boolean;
  /** For 'enum' fields: unordered allowed values */
  options?: string[];
  /** For 'scale' fields: ordered levels from low to high (e.g. ['Quiet', 'Conversational', 'Talkative']) */
  levels?: string[];
  /** For 'trait-list' fields: how many traits to generate */
  traitCount?: number;
  /** For 'trait-list' fields: constraint hint (e.g. "communication style adjectives") */
  traitConstraint?: string;
  /** For 'references' fields: how many references to generate */
  referenceCount?: number;
  /** For 'array' fields: type of items */
  arrayItemType?: FieldType;
  /** For 'object' and 'array' of objects: nested fields */
  fields?: SchemaField[];
  /** Generation hint: tells the LLM what kind of output this field expects */
  generationHint?: GenerationHint;
  /** Keys of other fields this field should be derived from for consistency */
  dependsOn?: string[];
}

export interface SchemaPreset {
  id: string;
  name: string;
  version: number;
  description?: string;
  fields: SchemaField[];
  builtIn?: boolean;
  createdAt: string;
  updatedAt: string;
  /** Completed example profiles used as few-shot quality anchors */
  examples?: Record<string, unknown>[];
  /** How specific/detailed the generator should be */
  specificity?: 'low' | 'medium' | 'high';
  /** Multi-pass generation order: groups of field keys, each group is one LLM call */
  generationOrder?: string[][];
}

// ============================================================
// Profile
// ============================================================

export interface GeneratedProfile {
  id: string;
  schemaId: string;
  schemaName: string;
  provider: LLMProvider;
  model: string;
  generatedAt: string;
  seeds: Record<string, unknown>;
  temperature: number;
  profile: Record<string, unknown>;
}

// ============================================================
// LLM Provider
// ============================================================

export type LLMProvider = 'openai' | 'anthropic' | 'gemini';

export interface ProviderConfig {
  id: LLMProvider;
  name: string;
  models: ModelOption[];
  defaultModel: string;
}

export interface ModelOption {
  id: string;
  name: string;
  supportsJsonMode: boolean;
}

export interface GenerationRequest {
  schema: SchemaPreset;
  seeds: Record<string, unknown>;
  provider: LLMProvider;
  model: string;
  temperature: number;
}

export interface GenerationResult {
  profile: Record<string, unknown>;
  raw: string;
  provider: LLMProvider;
  model: string;
  tokensUsed?: number;
}

/** Callbacks for a single pass within multi-pass generation */
export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (result: GenerationResult) => void;
  onError: (error: string) => void;
}

/** Callbacks for multi-pass generation with stage awareness */
export interface MultiPassCallbacks {
  onPassStart: (passIndex: number, passTotal: number, fieldKeys: string[]) => void;
  onToken: (token: string) => void;
  onPassComplete: (passIndex: number, partialProfile: Record<string, unknown>) => void;
  onComplete: (result: GenerationResult) => void;
  onError: (error: string) => void;
}

// ============================================================
// Settings
// ============================================================

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  apiKeys: {
    openai: string;
    anthropic: string;
    gemini: string;
  };
  defaultProvider: LLMProvider;
  defaultTemperature: number;
}

// ============================================================
// UI State
// ============================================================

export type AppView = 'generate' | 'schemas' | 'history' | 'settings';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: 'default' | 'success' | 'error';
  duration?: number;
}
