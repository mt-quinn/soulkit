import { create } from 'zustand';
import type { SchemaPreset, SchemaField } from '@/types';
import { storage } from '@/lib/storage';
import { generateId } from '@/lib/utils';
import { getDefaultPresets } from '@/lib/defaultPresets';

const SCHEMAS_DIR = 'schemas';

interface SchemaState {
  presets: SchemaPreset[];
  activePreset: SchemaPreset | null;
  loaded: boolean;
  loadPresets: () => Promise<void>;
  savePreset: (preset: SchemaPreset) => Promise<void>;
  createPreset: (name: string, description?: string) => Promise<SchemaPreset>;
  duplicatePreset: (id: string) => Promise<SchemaPreset | null>;
  deletePreset: (id: string) => Promise<void>;
  setActivePreset: (id: string | null) => void;
  updatePresetFields: (id: string, fields: SchemaField[]) => Promise<void>;
  renamePreset: (id: string, name: string) => Promise<void>;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  presets: [],
  activePreset: null,
  loaded: false,

  loadPresets: async () => {
    await storage.ensureDir(SCHEMAS_DIR);
    const files = await storage.listDir(SCHEMAS_DIR);
    const presets: SchemaPreset[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const preset = await storage.readJson<SchemaPreset>(`${SCHEMAS_DIR}/${file}`);
          presets.push(preset);
        } catch {
          // skip corrupt files
        }
      }
    }

    // Inject built-in presets if they don't exist yet
    const defaults = getDefaultPresets();
    for (const def of defaults) {
      if (!presets.find((p) => p.id === def.id)) {
        presets.push(def);
        await storage.writeJson(`${SCHEMAS_DIR}/${def.id}.json`, def);
      }
    }

    presets.sort((a, b) => a.name.localeCompare(b.name));
    set({ presets, loaded: true });
  },

  savePreset: async (preset) => {
    const updated = { ...preset, updatedAt: new Date().toISOString() };
    await storage.writeJson(`${SCHEMAS_DIR}/${updated.id}.json`, updated);
    set((state) => ({
      presets: state.presets.map((p) => (p.id === updated.id ? updated : p)),
      activePreset: state.activePreset?.id === updated.id ? updated : state.activePreset,
    }));
  },

  createPreset: async (name, description) => {
    const now = new Date().toISOString();
    const preset: SchemaPreset = {
      id: generateId(),
      name,
      version: 1,
      description,
      fields: [],
      createdAt: now,
      updatedAt: now,
    };
    await storage.writeJson(`${SCHEMAS_DIR}/${preset.id}.json`, preset);
    set((state) => ({ presets: [...state.presets, preset].sort((a, b) => a.name.localeCompare(b.name)) }));
    return preset;
  },

  duplicatePreset: async (id) => {
    const source = get().presets.find((p) => p.id === id);
    if (!source) return null;
    const now = new Date().toISOString();
    const preset: SchemaPreset = {
      ...JSON.parse(JSON.stringify(source)),
      id: generateId(),
      name: `${source.name} (Copy)`,
      builtIn: false,
      createdAt: now,
      updatedAt: now,
    };
    await storage.writeJson(`${SCHEMAS_DIR}/${preset.id}.json`, preset);
    set((state) => ({ presets: [...state.presets, preset].sort((a, b) => a.name.localeCompare(b.name)) }));
    return preset;
  },

  deletePreset: async (id) => {
    await storage.deleteFile(`${SCHEMAS_DIR}/${id}.json`);
    set((state) => ({
      presets: state.presets.filter((p) => p.id !== id),
      activePreset: state.activePreset?.id === id ? null : state.activePreset,
    }));
  },

  setActivePreset: (id) => {
    if (id === null) {
      set({ activePreset: null });
    } else {
      const preset = get().presets.find((p) => p.id === id) ?? null;
      set({ activePreset: preset });
    }
  },

  updatePresetFields: async (id, fields) => {
    const preset = get().presets.find((p) => p.id === id);
    if (!preset) return;
    const updated = { ...preset, fields, updatedAt: new Date().toISOString() };
    await get().savePreset(updated);
  },

  renamePreset: async (id, name) => {
    const preset = get().presets.find((p) => p.id === id);
    if (!preset) return;
    const updated = { ...preset, name, updatedAt: new Date().toISOString() };
    await get().savePreset(updated);
  },
}));
