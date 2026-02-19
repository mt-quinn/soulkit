import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLlmBarStore } from '@/stores/llmBarStore';
import type { SchemaField, SchemaPreset } from '@/types';
import { FieldEditor } from './FieldEditor';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { toast } from '@/stores/toastStore';
import { Plus, Copy, Trash2, FileText, Pencil, Layers, BookOpen, Settings, Sparkles, Loader2, CheckCircle2, RotateCcw, WandSparkles, Clock3, GitBranch, Download, Upload } from 'lucide-react';
import { cn, generateId, truncate } from '@/lib/utils';
import { generateSchemaDraft, parseSchemaDraft, refineSchemaDraft, suggestSchemaTransforms, type SchemaDraft } from '@/services/schemaAssistant';
import { FIXED_MODEL_NAME, FIXED_PROVIDER_NAME, FIXED_TEMPERATURE } from '@/services/types';
import { resolveProfileDisplayName } from '@/lib/profileIdentity';

interface SchemaAiRevision {
  id: string;
  createdAt: string;
  prompt: string;
  draft: SchemaDraft;
}

const DEFAULT_SCHEMA_TRANSFORMS = [
  'Increase specificity in narrative fields.',
  'Simplify field naming and reduce overlap.',
  'Add stronger behavioral calibration fields.',
  'Tighten generation order dependencies.',
  'Improve seedability for key identity fields.',
  'Reduce redundancy and merge similar fields.',
];

function cloneDraft(draft: SchemaDraft): SchemaDraft {
  return JSON.parse(JSON.stringify(draft)) as SchemaDraft;
}

function changedFieldKeys(before: SchemaDraft, after: SchemaDraft): string[] {
  const keys = new Set([...before.fields.map((field) => field.key), ...after.fields.map((field) => field.key)]);
  const beforeMap = new Map(before.fields.map((field) => [field.key, field]));
  const afterMap = new Map(after.fields.map((field) => [field.key, field]));
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(beforeMap.get(key)) !== JSON.stringify(afterMap.get(key))) {
      changed.push(key);
    }
  }
  return changed;
}

function applyFieldKeyPatch(base: SchemaDraft, candidate: SchemaDraft, selectedKeys: string[]): SchemaDraft {
  if (selectedKeys.length === 0) return candidate;
  const patchSet = new Set(selectedKeys);
  const candidateMap = new Map(candidate.fields.map((field) => [field.key, field]));
  return {
    ...base,
    fields: base.fields.map((field) => (patchSet.has(field.key) ? (candidateMap.get(field.key) ?? field) : field)),
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

function toSchemaDraft(preset: SchemaPreset): SchemaDraft {
  return {
    name: preset.name,
    description: preset.description,
    fields: JSON.parse(JSON.stringify(preset.fields)) as SchemaField[],
    examples: preset.examples ? (JSON.parse(JSON.stringify(preset.examples)) as Record<string, unknown>[]) : undefined,
    specificity: preset.specificity,
    generationOrder: preset.generationOrder ? (JSON.parse(JSON.stringify(preset.generationOrder)) as string[][]) : undefined,
  };
}

function fieldByKey(draft: SchemaDraft, key: string): SchemaField | undefined {
  return draft.fields.find((field) => field.key === key);
}

function fieldPreview(field: SchemaField | undefined): string {
  if (!field) return '(missing)';
  return JSON.stringify(field);
}

type EditorTab = 'fields' | 'examples' | 'settings';

interface SchemaEditorProps {
  isActive?: boolean;
}

export function SchemaEditor({ isActive = true }: SchemaEditorProps) {
  const {
    presets,
    activePreset,
    setActivePreset,
    createPreset,
    duplicatePreset,
    deletePreset,
    updatePresetFields,
    renamePreset,
    savePreset,
  } = useSchemaStore();
  const { hasApiKey, getApiKey, settings, setDeleteWarningSuppressed } = useSettingsStore();
  const { setConfig, resetConfig } = useLlmBarStore();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiGoal, setAiGoal] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraft, setAiDraft] = useState<SchemaDraft | null>(null);
  const [aiCandidateDraft, setAiCandidateDraft] = useState<SchemaDraft | null>(null);
  const [aiTargetPresetId, setAiTargetPresetId] = useState<string | null>(null);
  const [aiRefinePrompt, setAiRefinePrompt] = useState('');
  const [aiSelectedFields, setAiSelectedFields] = useState<string[]>([]);
  const [aiLockedFields, setAiLockedFields] = useState<string[]>([]);
  const [aiChangedFields, setAiChangedFields] = useState<string[]>([]);
  const [aiSelectedDiffFields, setAiSelectedDiffFields] = useState<string[]>([]);
  const [aiTransforms, setAiTransforms] = useState<string[]>(DEFAULT_SCHEMA_TRANSFORMS);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiRevisions, setAiRevisions] = useState<SchemaAiRevision[]>([]);
  const [aiPipelineStage, setAiPipelineStage] = useState(0);
  const [aiPipelineStarted, setAiPipelineStarted] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [importingPreset, setImportingPreset] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [skipDeleteWarningChecked, setSkipDeleteWarningChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>('fields');
  const [inlinePrompt, setInlinePrompt] = useState('');
  const [inlineSelectedFields, setInlineSelectedFields] = useState<string[]>([]);
  const [inlineLockedFields, setInlineLockedFields] = useState<string[]>([]);
  const [inlineGenerating, setInlineGenerating] = useState(false);
  const [inlineCandidateDraft, setInlineCandidateDraft] = useState<SchemaDraft | null>(null);
  const [inlineChangedFields, setInlineChangedFields] = useState<string[]>([]);
  const [inlineSelectedDiffFields, setInlineSelectedDiffFields] = useState<string[]>([]);
  const [inlineTransforms, setInlineTransforms] = useState<string[]>(DEFAULT_SCHEMA_TRANSFORMS);
  const [inlineSuggesting, setInlineSuggesting] = useState(false);
  const [schemaCommandMode, setSchemaCommandMode] = useState<'refine' | 'create'>('refine');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const preset = await createPreset(newName.trim(), newDescription.trim() || undefined);
    setSchemaCommandMode('refine');
    setActivePreset(preset.id);
    setCreateDialogOpen(false);
    setNewName('');
    setNewDescription('');
    toast('Preset created', `"${preset.name}" is ready to edit.`, 'success');
  };

  const handleDuplicate = async (id: string) => {
    const preset = await duplicatePreset(id);
    if (preset) {
      setSchemaCommandMode('refine');
      setActivePreset(preset.id);
      toast('Preset duplicated', `Created "${preset.name}".`, 'success');
    }
  };

  const handleExportPreset = (preset: SchemaPreset) => {
    const safeName = preset.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'schema';
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeName}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast('Schema exported', `"${preset.name}" downloaded as JSON.`, 'success');
  };

  const applyImportedDraft = useCallback(async (draft: SchemaDraft) => {
    const base = await createPreset(draft.name, draft.description);
    const importedPreset: SchemaPreset = {
      ...base,
      name: draft.name,
      description: draft.description,
      fields: draft.fields,
      specificity: draft.specificity,
      generationOrder: draft.generationOrder,
      examples: draft.examples,
      updatedAt: new Date().toISOString(),
    };
    await savePreset(importedPreset);
    setSchemaCommandMode('refine');
    setActivePreset(importedPreset.id);
    setCreateDialogOpen(false);
    setNewName('');
    setNewDescription('');
    toast('Schema imported', `"${importedPreset.name}" is ready to edit.`, 'success');
  }, [createPreset, savePreset, setActivePreset]);

  const importSchemaFromFile = useCallback(async (file: File) => {
    setImportingPreset(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
      const source = parsed
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && 'schema' in (parsed as Record<string, unknown>)
        ? (parsed as Record<string, unknown>).schema
        : parsed;
      const draft = parseSchemaDraft(source);
      await applyImportedDraft(draft);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid schema JSON file.';
      toast('Import failed', message, 'error');
    } finally {
      setImportingPreset(false);
      if (importFileRef.current) {
        importFileRef.current.value = '';
      }
    }
  }, [applyImportedDraft]);

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    if (skipDeleteWarningChecked) {
      await setDeleteWarningSuppressed('schemas', true);
    }
    const name = presets.find((p) => p.id === pendingDeleteId)?.name;
    await deletePreset(pendingDeleteId);
    setSkipDeleteWarningChecked(false);
    setPendingDeleteId(null);
    setDeleteDialogOpen(false);
    toast('Preset deleted', `"${name}" has been removed.`, 'default');
  };

  const requestDeletePreset = async (id: string) => {
    if (settings.ui.skipDeleteConfirmations.schemas) {
      const name = presets.find((preset) => preset.id === id)?.name;
      await deletePreset(id);
      toast('Preset deleted', `"${name}" has been removed.`, 'default');
      return;
    }
    setSkipDeleteWarningChecked(false);
    setPendingDeleteId(id);
    setDeleteDialogOpen(true);
  };

  const handleFieldsChange = (fields: SchemaField[]) => {
    if (!activePreset) return;
    updatePresetFields(activePreset.id, fields);
  };

  const addField = () => {
    if (!activePreset) return;
    const newField: SchemaField = {
      key: `field_${Date.now()}`,
      label: 'New Field',
      type: 'text',
      description: '',
      seedable: false,
    };
    handleFieldsChange([...activePreset.fields, newField]);
  };

  const updateField = (index: number, field: SchemaField) => {
    if (!activePreset) return;
    const fields = [...activePreset.fields];
    fields[index] = field;
    handleFieldsChange(fields);
  };

  const deleteField = (index: number) => {
    if (!activePreset) return;
    const fields = [...activePreset.fields];
    fields.splice(index, 1);
    handleFieldsChange(fields);
  };

  const handleRename = async () => {
    if (!activePreset || !renameValue.trim()) return;
    await renamePreset(activePreset.id, renameValue.trim());
    setRenameDialogOpen(false);
    toast('Renamed', `Preset renamed to "${renameValue.trim()}".`, 'success');
  };

  const allFieldKeys = activePreset?.fields.map((f) => f.key) ?? [];
  const aiHasKey = hasApiKey();
  const aiCommandRef = useRef<HTMLTextAreaElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const tabs: { id: EditorTab; label: string; icon: typeof Layers }[] = [
    { id: 'fields', label: 'Fields', icon: Layers },
    { id: 'examples', label: 'Examples', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const resetAiFlow = useCallback(() => {
    setAiGoal('');
    setAiGenerating(false);
    setAiDraft(null);
    setAiCandidateDraft(null);
    setAiTargetPresetId(null);
    setAiRefinePrompt('');
    setAiSelectedFields([]);
    setAiLockedFields([]);
    setAiChangedFields([]);
    setAiSelectedDiffFields([]);
    setAiTransforms(DEFAULT_SCHEMA_TRANSFORMS);
    setAiSuggesting(false);
    setAiRevisions([]);
    setAiPipelineStage(0);
    setAiPipelineStarted(false);
  }, []);

  const closeAiDialog = (open: boolean) => {
    setAiDialogOpen(open);
    if (!open) resetAiFlow();
  };

  const toggleAiSelectedField = (fieldKey: string) => {
    setAiSelectedFields((prev) =>
      prev.includes(fieldKey)
        ? prev.filter((key) => key !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const toggleAiLockedField = (fieldKey: string) => {
    setAiLockedFields((prev) =>
      prev.includes(fieldKey)
        ? prev.filter((key) => key !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const toggleAiDiffField = (fieldKey: string) => {
    setAiSelectedDiffFields((prev) =>
      prev.includes(fieldKey)
        ? prev.filter((key) => key !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const pushAiRevision = useCallback((prompt: string, draft: SchemaDraft) => {
    setAiRevisions((prev) => [
      ...prev,
      {
        id: generateId(),
        createdAt: new Date().toISOString(),
        prompt,
        draft: cloneDraft(draft),
      },
    ]);
  }, []);

  const clearAiCandidate = useCallback(() => {
    setAiCandidateDraft(null);
    setAiChangedFields([]);
    setAiSelectedDiffFields([]);
  }, []);

  const loadAiTransforms = useCallback(async (draft: SchemaDraft, selectedFieldKeys: string[]) => {
    if (!aiHasKey) {
      setAiTransforms(DEFAULT_SCHEMA_TRANSFORMS);
      return;
    }

    setAiSuggesting(true);
    try {
      const transforms = await suggestSchemaTransforms({
        apiKey: getApiKey(),
        draft,
        selectedFieldKeys,
      });
      setAiTransforms(transforms.length > 0 ? transforms : DEFAULT_SCHEMA_TRANSFORMS);
    } catch {
      setAiTransforms(DEFAULT_SCHEMA_TRANSFORMS);
    } finally {
      setAiSuggesting(false);
    }
  }, [aiHasKey, getApiKey]);

  useEffect(() => {
    if (!aiDraft) return;
    void loadAiTransforms(aiDraft, aiSelectedFields);
  }, [aiDraft, aiSelectedFields, loadAiTransforms]);

  const handleAiGenerate = useCallback(async () => {
    if (!aiGoal.trim()) {
      toast('No goal provided', 'Describe what the schema should achieve.', 'error');
      return;
    }
    if (!aiHasKey) {
      toast('No API key', 'Add your OpenAI API key in Settings.', 'error');
      return;
    }

    setAiGenerating(true);
    setAiPipelineStarted(true);
    setAiPipelineStage(0);
    clearAiCandidate();

    try {
      let streamed = false;
      const draft = await generateSchemaDraft({
        apiKey: getApiKey(),
        goal: aiGoal.trim(),
        onToken: (token) => {
          void token;
          if (!streamed) {
            streamed = true;
            setAiPipelineStage(1);
          }
        },
      });
      setAiPipelineStage(2);
      setAiDraft(cloneDraft(draft));
      setAiTargetPresetId(null);
      setAiSelectedFields([]);
      setAiLockedFields([]);
      setAiRefinePrompt('');
      setAiTransforms(DEFAULT_SCHEMA_TRANSFORMS);
      setAiRevisions([
        {
          id: generateId(),
          createdAt: new Date().toISOString(),
          prompt: aiGoal.trim(),
          draft: cloneDraft(draft),
        },
      ]);
      setAiPipelineStage(3);
      toast('Draft generated', 'Review the output and refine if needed before saving.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate schema draft.';
      toast('Schema generation failed', message, 'error');
    } finally {
      setAiGenerating(false);
    }
  }, [aiGoal, aiHasKey, clearAiCandidate, getApiKey]);

  const handleAiRefine = useCallback(async (instructionOverride?: string) => {
    if (!aiDraft) return;
    const instruction = (instructionOverride ?? aiRefinePrompt).trim();
    if (!instruction) {
      toast('No refinement prompt', 'Describe how to modify the schema output.', 'error');
      return;
    }
    if (!aiHasKey) {
      toast('No API key', 'Add your OpenAI API key in Settings.', 'error');
      return;
    }

    setAiGenerating(true);
    setAiPipelineStarted(true);
    setAiPipelineStage(0);
    clearAiCandidate();
    try {
      let streamed = false;
      const updated = await refineSchemaDraft({
        apiKey: getApiKey(),
        draft: aiDraft,
        instruction,
        selectedFieldKeys: aiSelectedFields,
        lockedFieldKeys: aiLockedFields,
        onToken: (token) => {
          void token;
          if (!streamed) {
            streamed = true;
            setAiPipelineStage(2);
          }
        },
      });
      setAiPipelineStage(3);
      const changedKeys = changedFieldKeys(aiDraft, updated);
      setAiCandidateDraft(updated);
      setAiChangedFields(changedKeys);
      setAiSelectedDiffFields(changedKeys);
      setAiRefinePrompt(instruction);
      toast('Review changes', changedKeys.length > 0 ? 'Accept or reject generated diff.' : 'No field-level changes detected.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refine schema draft.';
      toast('Schema refinement failed', message, 'error');
    } finally {
      setAiGenerating(false);
    }
  }, [aiDraft, aiRefinePrompt, aiSelectedFields, aiLockedFields, aiHasKey, clearAiCandidate, getApiKey]);

  const handleAiAcceptAll = useCallback(() => {
    if (!aiCandidateDraft) return;
    const nextDraft = cloneDraft(aiCandidateDraft);
    setAiDraft(nextDraft);
    pushAiRevision(aiRefinePrompt.trim() || 'Refine schema', nextDraft);
    clearAiCandidate();
    toast('Changes accepted', 'All regenerated fields were applied.', 'success');
  }, [aiCandidateDraft, aiRefinePrompt, pushAiRevision, clearAiCandidate]);

  const handleAiAcceptSelected = useCallback(() => {
    if (!aiDraft || !aiCandidateDraft) return;
    const selectedKeys = aiSelectedDiffFields.length > 0 ? aiSelectedDiffFields : aiChangedFields;
    if (selectedKeys.length === 0) {
      toast('No fields selected', 'Select at least one changed field to apply.', 'error');
      return;
    }
    const patched = applyFieldKeyPatch(aiDraft, aiCandidateDraft, selectedKeys);
    setAiDraft(cloneDraft(patched));
    pushAiRevision(`${aiRefinePrompt.trim() || 'Refine schema'} (selected diff)`, patched);
    clearAiCandidate();
    toast('Changes accepted', `Applied ${selectedKeys.length} selected field${selectedKeys.length > 1 ? 's' : ''}.`, 'success');
  }, [aiDraft, aiCandidateDraft, aiSelectedDiffFields, aiChangedFields, aiRefinePrompt, pushAiRevision, clearAiCandidate]);

  const handleAiRejectCandidate = useCallback(() => {
    clearAiCandidate();
    toast('Changes rejected', 'Generated diff was discarded.', 'default');
  }, [clearAiCandidate]);

  const handleAiRevert = useCallback((revision: SchemaAiRevision) => {
    const reverted = cloneDraft(revision.draft);
    setAiDraft(reverted);
    clearAiCandidate();
    pushAiRevision(`Revert to ${new Date(revision.createdAt).toLocaleString()}`, reverted);
    toast('Reverted', 'Schema draft reverted to selected revision.', 'success');
  }, [clearAiCandidate, pushAiRevision]);

  const handleAiForkRevision = useCallback(async (revision: SchemaAiRevision) => {
    const snapshot = cloneDraft(revision.draft);
    const base = await createPreset(`${snapshot.name} (Fork)`, snapshot.description);
    const forkedPreset: SchemaPreset = {
      ...base,
      name: `${snapshot.name} (Fork)`,
      description: snapshot.description,
      fields: snapshot.fields,
      specificity: snapshot.specificity,
      generationOrder: snapshot.generationOrder,
      examples: snapshot.examples,
      updatedAt: new Date().toISOString(),
    };
    await savePreset(forkedPreset);
    setActivePreset(forkedPreset.id);
    toast('Fork created', `Created "${forkedPreset.name}".`, 'success');
  }, [createPreset, savePreset, setActivePreset]);

  const handleAiSaveDraft = async () => {
    if (!aiDraft) return;
    if (aiCandidateDraft) {
      toast('Pending diff', 'Accept or reject pending changes before saving.', 'error');
      return;
    }
    if (aiTargetPresetId) {
      const existing = presets.find((preset) => preset.id === aiTargetPresetId);
      if (!existing) {
        toast('Preset not found', 'Could not find preset to update.', 'error');
        return;
      }
      const updatedPreset: SchemaPreset = {
        ...existing,
        name: aiDraft.name,
        description: aiDraft.description,
        fields: aiDraft.fields,
        specificity: aiDraft.specificity,
        generationOrder: aiDraft.generationOrder,
        examples: aiDraft.examples,
        updatedAt: new Date().toISOString(),
      };
      await savePreset(updatedPreset);
      setActivePreset(updatedPreset.id);
      setAiDialogOpen(false);
      resetAiFlow();
      toast('Schema updated', `"${updatedPreset.name}" has been updated.`, 'success');
      return;
    }

    const base = await createPreset(aiDraft.name, aiDraft.description);
    const generatedPreset: SchemaPreset = {
      ...base,
      name: aiDraft.name,
      description: aiDraft.description,
      fields: aiDraft.fields,
      specificity: aiDraft.specificity,
      generationOrder: aiDraft.generationOrder,
      examples: aiDraft.examples,
      updatedAt: new Date().toISOString(),
    };
    await savePreset(generatedPreset);
    setActivePreset(generatedPreset.id);
    setAiDialogOpen(false);
    resetAiFlow();
    toast('Schema saved', `"${generatedPreset.name}" is ready to edit.`, 'success');
  };

  const clearInlineCandidate = useCallback(() => {
    setInlineCandidateDraft(null);
    setInlineChangedFields([]);
    setInlineSelectedDiffFields([]);
  }, []);

  const toggleInlineSelectedField = (fieldKey: string) => {
    setInlineSelectedFields((prev) =>
      prev.includes(fieldKey) ? prev.filter((key) => key !== fieldKey) : [...prev, fieldKey]
    );
  };

  const toggleInlineLockedField = (fieldKey: string) => {
    setInlineLockedFields((prev) =>
      prev.includes(fieldKey) ? prev.filter((key) => key !== fieldKey) : [...prev, fieldKey]
    );
  };

  const toggleInlineDiffField = (fieldKey: string) => {
    setInlineSelectedDiffFields((prev) =>
      prev.includes(fieldKey) ? prev.filter((key) => key !== fieldKey) : [...prev, fieldKey]
    );
  };

  const refreshInlineTransforms = useCallback(async () => {
    if (!activePreset) return;
    if (!aiHasKey) {
      setInlineTransforms(DEFAULT_SCHEMA_TRANSFORMS);
      return;
    }
    setInlineSuggesting(true);
    try {
      const transforms = await suggestSchemaTransforms({
        apiKey: getApiKey(),
        draft: toSchemaDraft(activePreset),
        selectedFieldKeys: inlineSelectedFields,
      });
      setInlineTransforms(transforms.length > 0 ? transforms : DEFAULT_SCHEMA_TRANSFORMS);
    } catch {
      setInlineTransforms(DEFAULT_SCHEMA_TRANSFORMS);
    } finally {
      setInlineSuggesting(false);
    }
  }, [activePreset, aiHasKey, getApiKey, inlineSelectedFields]);

  useEffect(() => {
    setInlinePrompt('');
    setInlineSelectedFields([]);
    setInlineLockedFields([]);
    clearInlineCandidate();
    setInlineTransforms(DEFAULT_SCHEMA_TRANSFORMS);
  }, [activePreset?.id, clearInlineCandidate]);

  const handleInlineRefine = useCallback(async (instructionOverride?: string) => {
    if (!activePreset) return;
    if (!aiHasKey) {
      toast('No API key', 'Add your OpenAI API key in Settings.', 'error');
      return;
    }
    const instruction = (instructionOverride ?? inlinePrompt).trim();
    if (!instruction) {
      toast('No command', 'Enter a command to regenerate schema fields.', 'error');
      return;
    }

    const baseDraft = toSchemaDraft(activePreset);
    setInlineGenerating(true);
    clearInlineCandidate();

    try {
      const updated = await refineSchemaDraft({
        apiKey: getApiKey(),
        draft: baseDraft,
        instruction,
        selectedFieldKeys: inlineSelectedFields,
        lockedFieldKeys: inlineLockedFields,
        onToken: () => {},
      });
      const changed = changedFieldKeys(baseDraft, updated);
      setInlineCandidateDraft(updated);
      setInlineChangedFields(changed);
      setInlineSelectedDiffFields(changed);
      setInlinePrompt(instruction);
      toast('Review schema diff', changed.length > 0 ? 'Accept or reject regenerated field changes.' : 'No field-level changes detected.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Schema refinement failed.';
      toast('Schema refinement failed', message, 'error');
    } finally {
      setInlineGenerating(false);
    }
  }, [
    activePreset,
    aiHasKey,
    inlinePrompt,
    getApiKey,
    inlineSelectedFields,
    inlineLockedFields,
    clearInlineCandidate,
  ]);

  const applyInlineDraft = useCallback(async (draft: SchemaDraft, reason: string) => {
    if (!activePreset) return;
    const updatedPreset: SchemaPreset = {
      ...activePreset,
      name: draft.name,
      description: draft.description,
      fields: draft.fields,
      specificity: draft.specificity,
      generationOrder: draft.generationOrder,
      examples: draft.examples,
      updatedAt: new Date().toISOString(),
    };
    await savePreset(updatedPreset);
    setActivePreset(updatedPreset.id);
    clearInlineCandidate();
    toast('Schema updated', reason, 'success');
  }, [activePreset, savePreset, setActivePreset, clearInlineCandidate]);

  const handleInlineAcceptAll = async () => {
    if (!inlineCandidateDraft) return;
    await applyInlineDraft(inlineCandidateDraft, 'Applied all generated schema changes.');
  };

  const handleInlineAcceptSelected = async () => {
    if (!activePreset || !inlineCandidateDraft) return;
    const selected = inlineSelectedDiffFields.length > 0 ? inlineSelectedDiffFields : inlineChangedFields;
    if (selected.length === 0) {
      toast('No fields selected', 'Select at least one changed field to apply.', 'error');
      return;
    }
    const baseDraft = toSchemaDraft(activePreset);
    const patched = applyFieldKeyPatch(baseDraft, inlineCandidateDraft, selected);
    await applyInlineDraft(patched, `Applied ${selected.length} selected schema field${selected.length > 1 ? 's' : ''}.`);
  };

  const handleInlineReject = () => {
    clearInlineCandidate();
    toast('Schema diff rejected', 'Discarded generated schema changes.', 'default');
  };

  const handleCreateFromCommand = useCallback(async (goal: string) => {
    const trimmed = goal.trim();
    if (!trimmed) {
      toast('No goal provided', 'Describe what the new schema should achieve.', 'error');
      return;
    }
    if (!aiHasKey) {
      toast('No API key', 'Add your OpenAI API key in Settings.', 'error');
      return;
    }

    setInlineGenerating(true);
    clearInlineCandidate();

    try {
      const draft = await generateSchemaDraft({
        apiKey: getApiKey(),
        goal: trimmed,
        onToken: () => {},
      });
      const base = await createPreset(draft.name, draft.description);
      const generatedPreset: SchemaPreset = {
        ...base,
        name: draft.name,
        description: draft.description,
        fields: draft.fields,
        specificity: draft.specificity,
        generationOrder: draft.generationOrder,
        examples: draft.examples,
        updatedAt: new Date().toISOString(),
      };
      await savePreset(generatedPreset);
      setActivePreset(generatedPreset.id);
      setSchemaCommandMode('refine');
      setInlinePrompt(trimmed);
      toast('Schema created', `"${generatedPreset.name}" is ready to edit.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Schema creation failed.';
      toast('Schema creation failed', message, 'error');
    } finally {
      setInlineGenerating(false);
    }
  }, [aiHasKey, clearInlineCandidate, createPreset, getApiKey, savePreset, setActivePreset]);

  const handleRefineFromCommand = useCallback(async (instruction: string) => {
    const trimmed = instruction.trim();
    if (!trimmed) {
      toast('No command', 'Enter a command to regenerate schema fields.', 'error');
      return;
    }
    setInlinePrompt(trimmed);
    await handleInlineRefine(trimmed);
  }, [handleInlineRefine]);

  useEffect(() => {
    if (!isActive) return;

    if (!aiHasKey) {
      setConfig({
        chips: [{ id: 'view', label: 'Schemas' }],
        placeholder: 'Add your OpenAI key in Settings to run schema commands.',
        submitLabel: 'Run',
        disabled: true,
        disabledReason: 'Open Settings and add an API key.',
        busy: false,
        onSubmit: undefined,
      });
      return;
    }

    if (!activePreset || schemaCommandMode === 'create') {
      setConfig({
        chips: [
          { id: 'view', label: 'Schemas' },
          { id: 'mode', label: 'Mode: Create' },
        ],
        placeholder: 'Describe the new schema to create.',
        submitLabel: 'Create Schema',
        disabled: false,
        disabledReason: undefined,
        busy: inlineGenerating,
        onSubmit: handleCreateFromCommand,
      });
      return;
    }

    setConfig({
      chips: [
        { id: 'view', label: 'Schemas' },
        { id: 'mode', label: 'Mode: Refine' },
        { id: 'schema', label: `Schema: ${activePreset.name}` },
        { id: 'targets', label: `Targets: ${inlineSelectedFields.length || 'all'}` },
        { id: 'locks', label: `Locks: ${inlineLockedFields.length}` },
      ],
      placeholder: 'Refine selected schema fields from this command.',
      submitLabel: 'Refine Schema',
      disabled: false,
      disabledReason: undefined,
      busy: inlineGenerating,
      onSubmit: handleRefineFromCommand,
    });
  }, [
    activePreset,
    aiHasKey,
    handleCreateFromCommand,
    handleRefineFromCommand,
    isActive,
    inlineGenerating,
    inlineLockedFields.length,
    inlineSelectedFields.length,
    schemaCommandMode,
    setConfig,
  ]);

  useEffect(() => {
    if (!isActive) return;
    return () => resetConfig();
  }, [isActive, resetConfig]);

  useEffect(() => {
    if (!aiDialogOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (!isTypingTarget(event.target)) {
          event.preventDefault();
          aiCommandRef.current?.focus();
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        if (aiGenerating) return;
        if (!aiDraft && aiGoal.trim()) {
          event.preventDefault();
          void handleAiGenerate();
          return;
        }
        if (aiDraft && aiRefinePrompt.trim()) {
          event.preventDefault();
          void handleAiRefine();
        }
      }

      if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (!isTypingTarget(event.target) && aiDraft && aiRefinePrompt.trim() && !aiGenerating) {
          event.preventDefault();
          void handleAiRefine();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aiDialogOpen, aiDraft, aiGoal, aiRefinePrompt, aiGenerating, handleAiGenerate, handleAiRefine]);

  const aiPipeline = ['Interpret command', 'Regenerate target', 'Consistency pass', 'Finalize diff'];
  const aiActiveRevisionId = aiRevisions.length > 0 ? aiRevisions[aiRevisions.length - 1].id : null;
  const aiMetadataChanged = useMemo(() => {
    if (!aiDraft || !aiCandidateDraft) return false;
    return (
      aiDraft.name !== aiCandidateDraft.name
      || aiDraft.description !== aiCandidateDraft.description
      || aiDraft.specificity !== aiCandidateDraft.specificity
      || JSON.stringify(aiDraft.generationOrder ?? []) !== JSON.stringify(aiCandidateDraft.generationOrder ?? [])
      || JSON.stringify(aiDraft.examples ?? []) !== JSON.stringify(aiCandidateDraft.examples ?? [])
    );
  }, [aiDraft, aiCandidateDraft]);

  return (
    <div className="flex h-full">
      {/* Preset list sidebar */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Schema Presets</h2>
            <div className="flex items-center gap-1">
              <Button
                variant={schemaCommandMode === 'create' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setSchemaCommandMode((prev) => (prev === 'create' ? 'refine' : 'create'))}
                title="Toggle AI create mode"
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI New
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCreateDialogOpen(true)} title="Create manually">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Define the structure of your character profiles.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {presets.map((preset) => (
            <PresetListItem
              key={preset.id}
              preset={preset}
              active={activePreset?.id === preset.id}
              onClick={() => { setSchemaCommandMode('refine'); setActivePreset(preset.id); }}
              onExport={() => handleExportPreset(preset)}
              onDuplicate={() => handleDuplicate(preset.id)}
              onDelete={() => void requestDeletePreset(preset.id)}
            />
          ))}
          {presets.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No presets yet.</p>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto">
        {activePreset ? (
          <div className="max-w-3xl mx-auto p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">{activePreset.name}</h2>
                {activePreset.builtIn && <Badge variant="secondary" className="text-[10px]">Built-in</Badge>}
                {activePreset.generationOrder && activePreset.generationOrder.length > 1 && (
                  <Badge variant="outline" className="text-[10px]">{activePreset.generationOrder.length}-pass</Badge>
                )}
                <button
                  onClick={() => { setRenameValue(activePreset.name); setRenameDialogOpen(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExportPreset(activePreset)}>
                  <Download className="h-4 w-4 mr-1" /> Export JSON
                </Button>
                {activeTab === 'fields' && (
                  <Button variant="outline" size="sm" onClick={addField}>
                    <Plus className="h-4 w-4 mr-1" /> Add Field
                  </Button>
                )}
              </div>
            </div>

            {activePreset.description && (
              <p className="text-sm text-muted-foreground">{activePreset.description}</p>
            )}

            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <WandSparkles className="h-4 w-4" />
                  Schema Workspace
                </CardTitle>
                <CardDescription>
                  View and edit fields here, then iterate with AI in the same workspace.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <Badge variant="secondary">Schema: {activePreset.name}</Badge>
                  <Badge variant="outline">
                    Target: {inlineSelectedFields.length > 0 ? `${inlineSelectedFields.length}` : 'all'}
                  </Badge>
                  <Badge variant="outline">
                    Locks: {inlineLockedFields.length}
                  </Badge>
                  <Badge variant="outline">{activePreset.fields.length} fields</Badge>
                  {schemaCommandMode === 'create' && <Badge variant="secondary">Create mode active</Badge>}
                </div>

                <div className="rounded-md border border-border bg-muted/25 p-2.5 text-xs text-muted-foreground">
                  {schemaCommandMode === 'create'
                    ? 'Create mode is active.'
                    : inlinePrompt
                      ? `Last command: ${truncate(inlinePrompt, 180)}`
                      : 'No command run yet.'}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">One-click transforms</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => void refreshInlineTransforms()}
                      disabled={inlineGenerating || inlineSuggesting}
                    >
                      {inlineSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Refresh
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {inlineTransforms.map((transform) => (
                      <button
                        key={transform}
                        onClick={() => void handleRefineFromCommand(transform)}
                        disabled={inlineGenerating || schemaCommandMode === 'create'}
                        className="px-2.5 py-1 rounded-full border border-border bg-muted/30 text-xs hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                        title={transform}
                      >
                        {truncate(transform, 52)}
                      </button>
                    ))}
                  </div>
                </div>

                {inlineCandidateDraft && (
                  <div className="space-y-3 rounded-md border border-border p-3">
                    <div className="text-sm font-medium">Diff Review</div>
                    {inlineChangedFields.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No field-level changes detected.</p>
                    ) : (
                      <div className="space-y-2">
                        {inlineChangedFields.map((fieldKey) => {
                          const before = fieldByKey(toSchemaDraft(activePreset), fieldKey);
                          const after = fieldByKey(inlineCandidateDraft, fieldKey);
                          const selected = inlineSelectedDiffFields.includes(fieldKey);
                          return (
                            <div key={fieldKey} className="rounded-md border border-border p-2 space-y-1">
                              <label className="flex items-center gap-2 text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleInlineDiffField(fieldKey)}
                                  className="h-3.5 w-3.5 accent-primary"
                                />
                                {before?.label ?? after?.label ?? fieldKey}
                              </label>
                              <div className="text-[11px] text-muted-foreground">
                                <span className="text-destructive/80">before:</span> {truncate(fieldPreview(before), 160)}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                <span className="text-emerald-300">after:</span> {truncate(fieldPreview(after), 160)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void handleInlineAcceptAll()} disabled={inlineGenerating}>
                        <CheckCircle2 className="h-4 w-4" />
                        Accept All
                      </Button>
                      <Button variant="outline" onClick={() => void handleInlineAcceptSelected()} disabled={inlineGenerating || inlineSelectedDiffFields.length === 0}>
                        Accept Selected
                      </Button>
                      <Button variant="ghost" onClick={handleInlineReject} disabled={inlineGenerating}>
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer',
                    activeTab === id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Fields tab */}
            {activeTab === 'fields' && (
              <div className="space-y-2">
                {activePreset.fields.map((field, i) => (
                  <div key={`${field.key}-${i}`} className="rounded-md border border-border p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="text-xs text-muted-foreground">
                        AI scope for <span className="font-medium text-foreground">{field.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => toggleInlineSelectedField(field.key)}
                          className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors cursor-pointer ${
                            inlineSelectedFields.includes(field.key)
                              ? 'border-primary bg-primary/15 text-foreground'
                              : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                          }`}
                          title={inlineSelectedFields.includes(field.key) ? 'Remove from target' : 'Target this field for regenerate'}
                        >
                          {inlineSelectedFields.includes(field.key) ? 'Targeted' : 'Target'}
                        </button>
                        <button
                          onClick={() => toggleInlineLockedField(field.key)}
                          className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors cursor-pointer ${
                            inlineLockedFields.includes(field.key)
                              ? 'border-amber-500/70 bg-amber-500/15 text-amber-100'
                              : 'border-border text-muted-foreground hover:border-amber-400/50 hover:text-foreground'
                          }`}
                          title={inlineLockedFields.includes(field.key) ? 'Unlock field' : 'Lock field from regenerate'}
                        >
                          {inlineLockedFields.includes(field.key) ? 'Locked' : 'Lock'}
                        </button>
                      </div>
                    </div>
                    <FieldEditor
                      field={field}
                      onChange={(updated) => updateField(i, updated)}
                      onDelete={() => deleteField(i)}
                      allFieldKeys={allFieldKeys}
                    />
                  </div>
                ))}
                {activePreset.fields.length === 0 && (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        No fields defined yet. Click "Add Field" to start building your schema.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Examples tab */}
            {activeTab === 'examples' && (
              <ExamplesEditor preset={activePreset} onSave={savePreset} />
            )}

            {/* Settings tab */}
            {activeTab === 'settings' && (
              <SchemaSettingsEditor preset={activePreset} onSave={savePreset} />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No schema selected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {schemaCommandMode === 'create'
                  ? 'Create mode is active.'
                  : 'Select a preset from the sidebar or create a new one.'}
              </p>
              <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create Preset
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Schema Preset</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-border bg-muted/25 p-3 space-y-2">
              <p className="text-sm font-medium">Import from Soulkit JSON</p>
              <p className="text-xs text-muted-foreground">
                Import a schema exported from Soulkit and continue editing it here.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => importFileRef.current?.click()}
                disabled={importingPreset}
              >
                {importingPreset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Import .json
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void importSchemaFromFile(file);
                  }
                }}
              />
            </div>

            <div className="relative">
              <div className="h-px bg-border" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-[11px] text-muted-foreground">
                or create manually
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., Fantasy Villain" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="A brief description of this schema..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || importingPreset}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Schema Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={closeAiDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>AI Schema Workspace</DialogTitle>
            <DialogDescription>
              Generate or refine schemas, target fields, lock fields, and review diffs before applying.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[74vh] overflow-y-auto pr-1">
            {!aiDraft && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Create a schema brief</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    ref={aiCommandRef}
                    value={aiGoal}
                    onChange={(e) => setAiGoal(e.target.value)}
                    placeholder="I need a schema for a noir detective NPC with social style scales, case history, motivations, secrets, and dialogue tics..."
                    className="min-h-[140px] text-sm"
                    disabled={aiGenerating}
                  />
                  <div className="text-xs text-muted-foreground">
                    Using <span className="font-medium">{FIXED_PROVIDER_NAME}</span> · <span className="font-mono">{FIXED_MODEL_NAME}</span> · <span className="font-mono">T:{FIXED_TEMPERATURE.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {aiDraft && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <WandSparkles className="h-4 w-4" />
                      Unified Command Bar
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <Badge variant="secondary">Schema: {aiDraft.name}</Badge>
                      <Badge variant="outline">
                        Target: {aiSelectedFields.length > 0 ? `${aiSelectedFields.length} field${aiSelectedFields.length > 1 ? 's' : ''}` : 'whole schema'}
                      </Badge>
                      <Badge variant="outline">Locks: {aiLockedFields.length}</Badge>
                      <Badge variant="outline">{aiDraft.fields.length} fields</Badge>
                      {aiTargetPresetId && <Badge variant="secondary">editing existing preset</Badge>}
                      {aiDraft.specificity && <Badge variant="outline" className="capitalize">{aiDraft.specificity}</Badge>}
                      {aiDraft.generationOrder && aiDraft.generationOrder.length > 1 && (
                        <Badge variant="outline">{aiDraft.generationOrder.length}-pass</Badge>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Textarea
                        ref={aiCommandRef}
                        value={aiRefinePrompt}
                        onChange={(e) => setAiRefinePrompt(e.target.value)}
                        placeholder="Refine selected fields or whole schema. Press Cmd/Ctrl+Enter to run."
                        className="min-h-[96px] text-sm"
                        disabled={aiGenerating}
                      />
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        <span>Shortcuts: `/` focus command, `Cmd/Ctrl+Enter` run, `R` rerun.</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => void handleAiRefine()}
                      disabled={aiGenerating || !aiRefinePrompt.trim() || !aiHasKey}
                      className="w-full"
                      size="lg"
                    >
                      {aiGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <WandSparkles className="h-4 w-4" />
                          Regenerate
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">One-click transforms</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void loadAiTransforms(aiDraft, aiSelectedFields)}
                        disabled={aiGenerating || aiSuggesting}
                        className="h-7 text-[11px]"
                      >
                        {aiSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {aiTransforms.map((transform) => (
                        <button
                          key={transform}
                          onClick={() => void handleAiRefine(transform)}
                          className="px-2.5 py-1 rounded-full border border-border bg-muted/30 text-xs hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                          disabled={aiGenerating}
                          title={transform}
                        >
                          {truncate(transform, 52)}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Target fields</CardTitle>
                    <CardDescription>If no field is selected, the command applies to the whole schema.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {aiDraft.fields.map((field) => {
                        const selected = aiSelectedFields.includes(field.key);
                        return (
                          <button
                            key={`target-${field.key}`}
                            onClick={() => toggleAiSelectedField(field.key)}
                            className={`px-2.5 py-1 rounded-full border text-xs transition-colors cursor-pointer ${
                              selected
                                ? 'border-primary bg-primary/15 text-foreground'
                                : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-primary/50'
                            }`}
                            disabled={aiGenerating}
                          >
                            {field.label}
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Locked fields (preserve exactly)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {aiDraft.fields.map((field) => {
                        const locked = aiLockedFields.includes(field.key);
                        return (
                          <button
                            key={`lock-${field.key}`}
                            onClick={() => toggleAiLockedField(field.key)}
                            className={`px-2.5 py-1 rounded-full border text-xs transition-colors cursor-pointer ${
                              locked
                                ? 'border-amber-500/70 bg-amber-500/15 text-amber-100'
                                : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-amber-400/50'
                            }`}
                            disabled={aiGenerating}
                          >
                            {field.label}
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {aiPipelineStarted && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Execution Pipeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {aiPipeline.map((stage, index) => {
                      const done = aiPipelineStarted && index < aiPipelineStage;
                      const active = aiPipelineStarted && index === aiPipelineStage && aiGenerating;
                      return (
                        <div
                          key={stage}
                          className={`rounded-md border px-2 py-2 text-[11px] transition-colors ${
                            done
                              ? 'border-primary/50 bg-primary/10 text-foreground'
                              : active
                                ? 'border-primary/80 bg-primary/20 text-foreground animate-pulse'
                                : 'border-border bg-muted/30 text-muted-foreground'
                          }`}
                        >
                          {stage}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {aiDraft && aiCandidateDraft && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Diff Review</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {aiMetadataChanged && (
                    <div className="rounded-md border border-primary/40 bg-primary/10 p-2 text-[11px] text-muted-foreground">
                      Draft metadata changed (name/description/specificity/order/examples). Accept All to apply metadata changes.
                    </div>
                  )}
                  {aiChangedFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No field-level changes detected.</p>
                  ) : (
                    <div className="space-y-2">
                      {aiChangedFields.map((fieldKey) => {
                        const before = fieldByKey(aiDraft, fieldKey);
                        const after = fieldByKey(aiCandidateDraft, fieldKey);
                        const selected = aiSelectedDiffFields.includes(fieldKey);
                        return (
                          <div key={fieldKey} className="rounded-md border border-border p-2 space-y-1">
                            <label className="flex items-center gap-2 text-xs font-medium">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleAiDiffField(fieldKey)}
                                className="h-3.5 w-3.5 accent-primary"
                              />
                              {before?.label ?? after?.label ?? fieldKey}
                            </label>
                            <div className="text-[11px] text-muted-foreground">
                              <span className="text-destructive/80">before:</span> {truncate(fieldPreview(before), 180)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              <span className="text-emerald-300">after:</span> {truncate(fieldPreview(after), 180)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleAiAcceptAll} disabled={aiGenerating}>
                      <CheckCircle2 className="h-4 w-4" />
                      Accept All
                    </Button>
                    <Button variant="outline" onClick={handleAiAcceptSelected} disabled={aiGenerating || aiSelectedDiffFields.length === 0}>
                      Accept Selected
                    </Button>
                    <Button variant="ghost" onClick={handleAiRejectCandidate} disabled={aiGenerating}>
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {aiDraft && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Revision History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {aiRevisions.length === 0 && (
                    <p className="text-sm text-muted-foreground">No revisions yet.</p>
                  )}
                  {aiRevisions.slice().reverse().map((revision) => (
                    <div key={revision.id} className="rounded-md border border-border p-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-medium">{new Date(revision.createdAt).toLocaleString()}</span>
                          {revision.id === aiActiveRevisionId && (
                            <Badge variant="outline" className="ml-2 text-[10px]">active</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => void handleAiForkRevision(revision)}
                          >
                            <GitBranch className="h-3.5 w-3.5" />
                            Fork
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => handleAiRevert(revision)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Revert
                          </Button>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{truncate(revision.prompt, 180)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {!aiHasKey && (
              <p className="text-xs text-amber-400">
                No API key configured for OpenAI. Add one in Settings.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => closeAiDialog(false)}>
              {aiDraft ? 'Close' : 'Cancel'}
            </Button>
            {aiDraft ? (
              <>
                <Button variant="outline" onClick={resetAiFlow} disabled={aiGenerating}>
                  Start Over
                </Button>
                <Button onClick={handleAiSaveDraft} disabled={aiGenerating || !!aiCandidateDraft}>
                  {aiTargetPresetId ? 'Save Changes' : 'Save As Preset'}
                </Button>
              </>
            ) : (
              <Button onClick={() => void handleAiGenerate()} disabled={aiGenerating || !aiGoal.trim() || !aiHasKey}>
                {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Draft
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Preset</DialogTitle></DialogHeader>
          <div className="py-2">
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && handleRename()} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setPendingDeleteId(null);
            setSkipDeleteWarningChecked(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Preset</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete "{presets.find((p) => p.id === pendingDeleteId)?.name}"? This action cannot be undone.
          </p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
            <input
              type="checkbox"
              checked={skipDeleteWarningChecked}
              onChange={(event) => setSkipDeleteWarningChecked(event.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Do not show this again
          </label>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteDialogOpen(false);
                setPendingDeleteId(null);
                setSkipDeleteWarningChecked(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Examples Editor
// ============================================================

function ExamplesEditor({ preset, onSave }: { preset: SchemaPreset; onSave: (p: SchemaPreset) => Promise<void> }) {
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState('');
  const examples = preset.examples ?? [];

  const addExample = () => {
    setParseError('');
    try {
      const parsed = JSON.parse(jsonInput);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setParseError('Must be a JSON object, not an array.');
        return;
      }
      const updated = { ...preset, examples: [...examples, parsed] };
      onSave(updated);
      setJsonInput('');
      toast('Example added', `Now using ${examples.length + 1} example(s) as quality anchors.`, 'success');
    } catch {
      setParseError('Invalid JSON. Please paste a valid JSON object.');
    }
  };

  const removeExample = (index: number) => {
    const updated = { ...preset, examples: examples.filter((_, i) => i !== index) };
    onSave(updated);
    toast('Example removed', '', 'default');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Few-Shot Examples</CardTitle>
          <CardDescription>
            Paste completed profile JSON objects as quality anchors. The generator will use these as examples of the quality and style you expect. 1-3 examples recommended.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {examples.length > 0 && (
            <div className="space-y-2">
              {examples.map((ex, i) => {
                const name = resolveProfileDisplayName(ex, { fallback: `Example ${i + 1}` });
                return (
                  <div key={i} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-[10px] text-muted-foreground">{Object.keys(ex).length} fields</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeExample(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Paste example profile JSON</label>
            <Textarea
              value={jsonInput}
              onChange={(e) => { setJsonInput(e.target.value); setParseError(''); }}
              placeholder='{"name": "Julian", "archetype": "The Witty Instigator", ...}'
              className="font-mono text-xs min-h-[120px]"
            />
            {parseError && <p className="text-xs text-destructive">{parseError}</p>}
            <Button variant="secondary" size="sm" onClick={addExample} disabled={!jsonInput.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Example
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Schema Settings Editor
// ============================================================

function SchemaSettingsEditor({ preset, onSave }: { preset: SchemaPreset; onSave: (p: SchemaPreset) => Promise<void> }) {
  const fieldKeys = preset.fields.map((f) => f.key);
  const currentOrder = preset.generationOrder ?? [];
  const [orderText, setOrderText] = useState(
    currentOrder.map((pass) => pass.join(', ')).join('\n')
  );

  const handleSpecificityChange = (specificity: SchemaPreset['specificity']) => {
    onSave({ ...preset, specificity });
  };

  const handleOrderSave = () => {
    const lines = orderText.split('\n').filter((l) => l.trim());
    const order = lines.map((line) =>
      line.split(',').map((k) => k.trim()).filter(Boolean)
    ).filter((pass) => pass.length > 0);

    onSave({ ...preset, generationOrder: order.length > 0 ? order : undefined });
    toast('Generation order saved', order.length > 1 ? `${order.length}-pass generation configured.` : 'Single-pass mode.', 'success');
  };

  return (
    <div className="space-y-4">
      {/* Specificity */}
      <Card>
        <CardHeader>
          <CardTitle>Specificity Level</CardTitle>
          <CardDescription>
            Controls how concrete and detailed the generator's output will be.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                onClick={() => handleSpecificityChange(level)}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer capitalize',
                  (preset.specificity ?? 'high') === level
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                )}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {(preset.specificity ?? 'high') === 'low' && 'Broad strokes, general descriptions. Good for quick drafts.'}
            {(preset.specificity ?? 'high') === 'medium' && 'Balanced detail. Specific where it matters, flexible elsewhere.'}
            {(preset.specificity ?? 'high') === 'high' && 'Maximum detail. Vivid, concrete, and memorable. No generic filler.'}
          </p>
        </CardContent>
      </Card>

      {/* Generation Order */}
      <Card>
        <CardHeader>
          <CardTitle>Generation Order (Multi-Pass)</CardTitle>
          <CardDescription>
            Define how fields are grouped into generation passes. Each line is one LLM call. Later passes receive all output from earlier passes as context, enabling consistency.
            Leave empty for single-pass generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={orderText}
            onChange={(e) => setOrderText(e.target.value)}
            placeholder={`Pass 1: name, pronouns, archetype\nPass 2: chattiness, steering, adaptability\nPass 3: description, backstory\nPass 4: quirk, talking_traits, character_references`}
            className="font-mono text-xs min-h-[120px]"
          />
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Available keys: <span className="font-mono">{fieldKeys.join(', ')}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleOrderSave}>
              Save Order
            </Button>
          </div>
          {currentOrder.length > 1 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Current passes:</label>
              {currentOrder.map((pass, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px] shrink-0">Pass {i + 1}</Badge>
                  <span className="font-mono text-muted-foreground">{pass.join(', ')}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Preset List Item
// ============================================================

function PresetListItem({
  preset,
  active,
  onClick,
  onExport,
  onDuplicate,
  onDelete,
}: {
  preset: SchemaPreset;
  active: boolean;
  onClick: () => void;
  onExport: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex items-center justify-between rounded-md px-3 py-2 cursor-pointer transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{preset.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {preset.fields.length} field{preset.fields.length !== 1 ? 's' : ''}
          {preset.builtIn && ' · built-in'}
          {preset.generationOrder && preset.generationOrder.length > 1 && ` · ${preset.generationOrder.length}-pass`}
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); onExport(); }} className="p-1 rounded hover:bg-background/50 cursor-pointer" title="Export JSON">
          <Download className="h-3 w-3" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="p-1 rounded hover:bg-background/50 cursor-pointer" title="Duplicate">
          <Copy className="h-3 w-3" />
        </button>
        {!preset.builtIn && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 rounded hover:bg-background/50 text-destructive cursor-pointer" title="Delete">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
