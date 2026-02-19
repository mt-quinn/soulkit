import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useProfileStore } from '@/stores/profileStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { refineProfile, suggestProfileTransforms } from '@/services/provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/stores/toastStore';
import { formatDate, generateId, truncate } from '@/lib/utils';
import { resolveProfileDisplayName, resolveProfileNameFieldKey } from '@/lib/profileIdentity';
import { storage } from '@/lib/storage';
import { ProfileStructuredFieldInput } from './ProfileStructuredFieldInput';
import {
  applyPathSelections,
  cloneJson,
  diffPaths,
  evaluateConfidence,
  getPathValue,
  setPathValue,
} from '@/lib/workspace';
import type {
  ConfidenceReport,
  GeneratedProfile,
  ProfileRevision,
  ProfileRevisionKind,
  SchemaField,
  SchemaPreset,
} from '@/types';
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
  Loader2,
  RotateCcw,
  Sparkles,
  WandSparkles,
  MessagesSquare,
  Download,
} from 'lucide-react';

interface ProfileRefinePanelProps {
  profile: GeneratedProfile;
  onProfileUpdated?: (profile: GeneratedProfile) => void;
  disabled?: boolean;
  externalCommand?: { id: number; text: string } | null;
  onBusyChange?: (busy: boolean) => void;
}

const DEFAULT_TRANSFORMS = [
  'Make tone more concise and grounded.',
  'Increase emotional warmth without losing clarity.',
  'Raise specificity with concrete details.',
  'Reduce melodrama and keep realism high.',
  'Sharpen voice consistency across all fields.',
  'Increase contrast in strengths and flaws.',
];

function mergeRevision(
  profile: GeneratedProfile,
  kind: ProfileRevisionKind,
  prompt: string,
  snapshot: Record<string, unknown>,
  options?: {
    selectedFields?: string[];
    lockedFields?: string[];
    confidence?: ConfidenceReport;
    parentRevisionId?: string;
  }
): GeneratedProfile {
  const currentRevisions = profile.revisions ? [...profile.revisions] : [];
  const newRevisionId = generateId();
  const revision: ProfileRevision = {
    id: newRevisionId,
    createdAt: new Date().toISOString(),
    kind,
    prompt,
    snapshot,
    selectedFields: options?.selectedFields,
    lockedFields: options?.lockedFields,
    confidence: options?.confidence,
    parentRevisionId: options?.parentRevisionId,
  };
  currentRevisions.push(revision);
  return {
    ...profile,
    generatedAt: revision.createdAt,
    profile: snapshot,
    revisions: currentRevisions,
    activeRevisionId: newRevisionId,
  };
}

function mergeAutosaveSnapshot(
  profile: GeneratedProfile,
  snapshot: Record<string, unknown>,
  confidence: ConfidenceReport
): GeneratedProfile {
  const revisions = profile.revisions ? [...profile.revisions] : [];
  let activeRevisionId = profile.activeRevisionId;

  if (revisions.length === 0) {
    const id = generateId();
    revisions.push({
      id,
      createdAt: new Date().toISOString(),
      kind: 'edit',
      prompt: 'Auto-save inline edits',
      snapshot,
      confidence,
    });
    activeRevisionId = id;
  } else {
    let targetIndex = activeRevisionId ? revisions.findIndex((revision) => revision.id === activeRevisionId) : -1;
    if (targetIndex < 0) {
      targetIndex = revisions.length - 1;
      activeRevisionId = revisions[targetIndex].id;
    }
    revisions[targetIndex] = {
      ...revisions[targetIndex],
      snapshot,
      confidence,
    };
  }

  return {
    ...profile,
    profile: snapshot,
    revisions,
    activeRevisionId,
  };
}

function renderValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function toSafeFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

function buildConstraintPatch(
  baseProfile: Record<string, unknown>,
  draftProfile: Record<string, unknown>
): Record<string, unknown> | undefined {
  const changedPaths = diffPaths(baseProfile, draftProfile).filter((path) => path !== '$');
  if (changedPaths.length === 0) return undefined;

  let patch: Record<string, unknown> = {};
  for (const path of changedPaths) {
    patch = setPathValue(patch, path, getPathValue(draftProfile, path));
  }
  return patch;
}

function ConfidenceStrip({ confidence }: { confidence: ConfidenceReport }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <Badge variant={confidence.schemaValid ? 'default' : 'destructive'} className="text-[10px]">
        schema-{confidence.schemaValid ? 'valid' : 'invalid'}
      </Badge>
      <Badge variant={confidence.fieldsComplete ? 'default' : 'secondary'} className="text-[10px]">
        fields-{confidence.fieldsComplete ? 'complete' : 'partial'}
      </Badge>
      <Badge variant="outline" className="text-[10px]">passes:{confidence.passes}</Badge>
      {confidence.warnings.length > 0 && (
        <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/40">
          {confidence.warnings.length} warning{confidence.warnings.length > 1 ? 's' : ''}
        </Badge>
      )}
    </div>
  );
}

interface TopLevelFieldOption {
  path: string;
  label: string;
  schemaField?: SchemaField;
}

interface PendingAutosave {
  snapshot: Record<string, unknown>;
  serialized: string;
  profile: GeneratedProfile;
  schema: SchemaPreset;
}

export function ProfileRefinePanel({
  profile,
  onProfileUpdated,
  disabled = false,
  externalCommand = null,
  onBusyChange,
}: ProfileRefinePanelProps) {
  const { hasApiKey, getApiKey } = useSettingsStore();
  const { presets } = useSchemaStore();
  const { updateProfile, addProfile, setActiveProfile } = useProfileStore();
  const { setActiveView } = useNavigationStore();

  const [command, setCommand] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [lockedFields, setLockedFields] = useState<string[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [pipelineStage, setPipelineStage] = useState(0);
  const [pipelineStarted, setPipelineStarted] = useState(false);

  const [transformSuggestions, setTransformSuggestions] = useState<string[]>(DEFAULT_TRANSFORMS);
  const [candidateProfile, setCandidateProfile] = useState<Record<string, unknown> | null>(null);
  const [candidateDiffPaths, setCandidateDiffPaths] = useState<string[]>([]);
  const [selectedDiffPaths, setSelectedDiffPaths] = useState<string[]>([]);
  const [candidateConfidence, setCandidateConfidence] = useState<ConfidenceReport | null>(null);

  const [fieldDraft, setFieldDraft] = useState<Record<string, unknown>>(profile.profile);
  const [workspaceDraft, setWorkspaceDraft] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [useWorkspaceConstraints, setUseWorkspaceConstraints] = useState(false);
  const [autoAcceptChanges, setAutoAcceptChanges] = useState(false);

  const lastExternalCommandId = useRef<number | null>(null);
  const loadedProfileIdRef = useRef<string | null>(null);
  const profileRef = useRef(profile);
  const lastPersistedSnapshotRef = useRef(JSON.stringify(profile.profile));
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosavePendingRef = useRef<PendingAutosave | null>(null);

  const schema = useMemo(
    () => presets.find((preset) => preset.id === profile.schemaId) ?? null,
    [presets, profile.schemaId]
  );
  const nameFieldPath = useMemo(
    () => resolveProfileNameFieldKey(fieldDraft, { schema }),
    [fieldDraft, schema]
  );
  const fieldOptions = useMemo<TopLevelFieldOption[]>(() => {
    const schemaOptions = schema
      ? schema.fields.map((field) => ({
        path: field.key,
        label: field.label,
        schemaField: field,
      }))
      : [];
    const existingKeys = new Set(schemaOptions.map((field) => field.path));
    const fallback = Object.keys(fieldDraft)
      .filter((key) => !existingKeys.has(key))
      .map((key) => ({
        path: key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      }));
    const combined = [...schemaOptions, ...fallback];
    if (nameFieldPath && !combined.some((field) => field.path === nameFieldPath)) {
      combined.unshift({
        path: nameFieldPath,
        label: nameFieldPath.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      });
    }
    return combined.sort((a, b) => {
      if (nameFieldPath && a.path === nameFieldPath) return -1;
      if (nameFieldPath && b.path === nameFieldPath) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [schema, fieldDraft, nameFieldPath]);
  const revisions = useMemo(() => profile.revisions ?? [], [profile.revisions]);
  const activeConfidence = useMemo(() => {
    const active = revisions.find((revision) => revision.id === profile.activeRevisionId);
    return active?.confidence ?? (schema ? evaluateConfidence(schema, fieldDraft, schema.generationOrder?.length ?? 1) : null);
  }, [revisions, profile.activeRevisionId, schema, fieldDraft]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!nameFieldPath) return;
    if (nameFieldPath in fieldDraft) return;
    setFieldDraft((prev) => {
      const next = { ...prev, [nameFieldPath]: '' };
      setWorkspaceDraft(JSON.stringify(next, null, 2));
      return next;
    });
  }, [nameFieldPath, fieldDraft]);

  const toggleSelection = (path: string) => {
    setSelectedFields((prev) =>
      prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]
    );
  };

  const toggleLock = (path: string) => {
    setLockedFields((prev) =>
      prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]
    );
  };

  const toggleDiffPath = (path: string) => {
    setSelectedDiffPaths((prev) =>
      prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]
    );
  };

  const updateFieldDraftValue = useCallback((key: string, value: unknown) => {
    setFieldDraft((prev) => {
      const next = { ...prev, [key]: value };
      setWorkspaceDraft(JSON.stringify(next, null, 2));
      return next;
    });
  }, []);

  const loadTransformSuggestions = useCallback(async () => {
    if (!schema) return;
    if (!hasApiKey()) return;
    setIsSuggesting(true);
    try {
      const suggestions = await suggestProfileTransforms(
        getApiKey(),
        schema,
        fieldDraft,
        selectedFields
      );
      setTransformSuggestions(suggestions.length > 0 ? suggestions : DEFAULT_TRANSFORMS);
    } catch {
      setTransformSuggestions(DEFAULT_TRANSFORMS);
    } finally {
      setIsSuggesting(false);
    }
  }, [schema, hasApiKey, getApiKey, fieldDraft, selectedFields]);

  const parseWorkspaceConstraints = useCallback((baseProfile: Record<string, unknown>): Record<string, unknown> | undefined => {
    if (!useWorkspaceConstraints) return undefined;
    setWorkspaceError('');
    return buildConstraintPatch(baseProfile, fieldDraft);
  }, [useWorkspaceConstraints, fieldDraft]);

  const flushAutosave = useCallback(async () => {
    if (autosaveInFlightRef.current) return;
    const next = autosavePendingRef.current;
    if (!next) return;

    autosaveInFlightRef.current = true;
    autosavePendingRef.current = null;
    try {
      const confidence = evaluateConfidence(next.schema, next.snapshot, next.schema.generationOrder?.length ?? 1);
      const autosaved = mergeAutosaveSnapshot(next.profile, next.snapshot, confidence);
      await updateProfile(autosaved);
      onProfileUpdated?.(autosaved);
      if (profileRef.current.id === autosaved.id) {
        profileRef.current = autosaved;
        lastPersistedSnapshotRef.current = next.serialized;
      }
    } catch {
      // Silent failure: do not interrupt editing flow with repeated autosave toasts.
    } finally {
      autosaveInFlightRef.current = false;
      if (autosavePendingRef.current) {
        void flushAutosave();
      }
    }
  }, [updateProfile, onProfileUpdated]);

  useEffect(() => {
    if (loadedProfileIdRef.current === profile.id) return;
    loadedProfileIdRef.current = profile.id;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (autosavePendingRef.current) {
      void flushAutosave();
    }

    setCommand('');
    setSelectedFields([]);
    setLockedFields([]);
    setPipelineStage(0);
    setPipelineStarted(false);
    setCandidateProfile(null);
    setCandidateDiffPaths([]);
    setSelectedDiffPaths([]);
    setCandidateConfidence(null);
    setFieldDraft(cloneJson(profile.profile));
    setWorkspaceDraft(JSON.stringify(profile.profile, null, 2));
    setWorkspaceError('');
    setUseWorkspaceConstraints(false);
    setTransformSuggestions(DEFAULT_TRANSFORMS);
    lastPersistedSnapshotRef.current = JSON.stringify(profile.profile);
  }, [profile.id, profile.profile, flushAutosave]);

  useEffect(() => {
    if (!schema || disabled || isRefining) return;
    const serialized = JSON.stringify(fieldDraft);
    if (serialized === lastPersistedSnapshotRef.current) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      autosavePendingRef.current = {
        snapshot: cloneJson(fieldDraft),
        serialized,
        profile: profileRef.current,
        schema,
      };
      void flushAutosave();
    }, 250);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [fieldDraft, schema, disabled, isRefining, flushAutosave]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (autosavePendingRef.current) {
        void flushAutosave();
      }
    };
  }, [flushAutosave]);

  const handleRun = useCallback(async (instruction: string) => {
    if (!schema) {
      toast('Schema missing', 'Could not locate the schema for this profile.', 'error');
      return;
    }
    if (!hasApiKey()) {
      toast('No API key', 'Add your OpenAI API key in Settings.', 'error');
      return;
    }
    if (!instruction.trim()) {
      toast('No command', 'Enter a command for regeneration.', 'error');
      return;
    }

    const constraints = parseWorkspaceConstraints(cloneJson(profile.profile));

    const currentSnapshot = cloneJson(fieldDraft);

    setIsRefining(true);
    setPipelineStarted(true);
    setPipelineStage(0);
    setCandidateProfile(null);
    setCandidateDiffPaths([]);
    setSelectedDiffPaths([]);
    setCandidateConfidence(null);

    try {
      setPipelineStage(1);
      const result = await refineProfile(
        getApiKey(),
        schema,
        currentSnapshot,
        profile.prompt,
        instruction.trim(),
        selectedFields,
        lockedFields,
        constraints,
        (token) => {
          void token;
          setPipelineStage(2);
        }
      );

      setPipelineStage(3);
      const changed = diffPaths(currentSnapshot, result.profile).filter((path) => path !== '$');
      const confidence = evaluateConfidence(schema, result.profile, schema.generationOrder?.length ?? 1);
      setCommand(instruction.trim());

      if (autoAcceptChanges) {
        if (changed.length === 0) {
          toast('No changes detected', 'Nothing to auto-accept from this run.');
          return;
        }

        const merged = mergeRevision(
          profile,
          'refine',
          instruction.trim(),
          result.profile,
          {
            selectedFields,
            lockedFields,
            confidence,
            parentRevisionId: profile.activeRevisionId,
          }
        );
        await updateProfile(merged);
        onProfileUpdated?.(merged);
        profileRef.current = merged;
        lastPersistedSnapshotRef.current = JSON.stringify(result.profile);
        setFieldDraft(cloneJson(result.profile));
        setWorkspaceDraft(JSON.stringify(result.profile, null, 2));
        setCandidateProfile(null);
        setCandidateDiffPaths([]);
        setSelectedDiffPaths([]);
        setCandidateConfidence(null);
        toast('Changes auto-accepted', `Applied ${changed.length} diff item${changed.length > 1 ? 's' : ''}.`, 'success');
        return;
      }

      setCandidateProfile(result.profile);
      setCandidateDiffPaths(changed);
      setSelectedDiffPaths(changed);
      setCandidateConfidence(confidence);
      toast('Review changes', changed.length > 0 ? 'Accept or reject generated diff.' : 'No changes detected.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refinement failed.';
      toast('Refinement failed', message, 'error');
    } finally {
      setIsRefining(false);
    }
  }, [
    schema,
    hasApiKey,
    getApiKey,
    profile,
    fieldDraft,
    selectedFields,
    lockedFields,
    autoAcceptChanges,
    updateProfile,
    onProfileUpdated,
    parseWorkspaceConstraints,
  ]);

  useEffect(() => {
    onBusyChange?.(isRefining);
  }, [isRefining, onBusyChange]);

  useEffect(() => {
    if (!externalCommand) return;
    if (lastExternalCommandId.current === externalCommand.id) return;
    lastExternalCommandId.current = externalCommand.id;
    setCommand(externalCommand.text);
    void handleRun(externalCommand.text);
  }, [externalCommand, handleRun]);

  const applyUpdatedProfile = useCallback(async (
    nextSnapshot: Record<string, unknown>,
    kind: ProfileRevisionKind,
    prompt: string,
    options?: {
      selectedFields?: string[];
      lockedFields?: string[];
      confidence?: ConfidenceReport;
      parentRevisionId?: string;
    }
  ) => {
    const merged = mergeRevision(profile, kind, prompt, nextSnapshot, options);
    await updateProfile(merged);
    onProfileUpdated?.(merged);
    setFieldDraft(cloneJson(nextSnapshot));
    setWorkspaceDraft(JSON.stringify(nextSnapshot, null, 2));
    setCandidateProfile(null);
    setCandidateDiffPaths([]);
    setSelectedDiffPaths([]);
    setCandidateConfidence(null);
    profileRef.current = merged;
    lastPersistedSnapshotRef.current = JSON.stringify(nextSnapshot);
  }, [profile, updateProfile, onProfileUpdated]);

  const handleAcceptAll = async () => {
    if (!candidateProfile || !schema) return;
    const confidence = candidateConfidence ?? evaluateConfidence(schema, candidateProfile, schema.generationOrder?.length ?? 1);
    await applyUpdatedProfile(
      candidateProfile,
      'refine',
      command,
      {
        selectedFields,
        lockedFields,
        confidence,
        parentRevisionId: profile.activeRevisionId,
      }
    );
    toast('Changes accepted', 'All regenerated changes were applied.', 'success');
  };

  const handleAcceptSelected = async () => {
    if (!candidateProfile || !schema) return;
    const selected = selectedDiffPaths.length > 0 ? selectedDiffPaths : candidateDiffPaths;
    const applied = applyPathSelections(fieldDraft, candidateProfile, selected);
    const confidence = evaluateConfidence(schema, applied, schema.generationOrder?.length ?? 1);
    await applyUpdatedProfile(
      applied,
      'refine',
      `${command} (selected diff)`,
      {
        selectedFields: selected,
        lockedFields,
        confidence,
        parentRevisionId: profile.activeRevisionId,
      }
    );
    toast('Changes accepted', `Applied ${selected.length} selected diff item${selected.length > 1 ? 's' : ''}.`, 'success');
  };

  const handleRejectCandidate = () => {
    setCandidateProfile(null);
    setCandidateDiffPaths([]);
    setSelectedDiffPaths([]);
    setCandidateConfidence(null);
    toast('Changes rejected', 'Generated diff was discarded.', 'default');
  };

  const handleApplyWorkspace = async () => {
    if (!schema) return;
    try {
      const parsed = JSON.parse(workspaceDraft);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setWorkspaceError('Workspace JSON must be an object.');
        return;
      }
      setWorkspaceError('');
      const confidence = evaluateConfidence(schema, parsed as Record<string, unknown>, schema.generationOrder?.length ?? 1);
      await applyUpdatedProfile(
        parsed as Record<string, unknown>,
        'edit',
        'Inline workspace edits',
        {
          confidence,
          parentRevisionId: profile.activeRevisionId,
        }
      );
      toast('Workspace applied', 'Inline edits are now active constraints for regeneration.', 'success');
    } catch {
      setWorkspaceError('Workspace JSON is invalid.');
    }
  };

  const handleRevert = async (revision: ProfileRevision) => {
    if (!schema) return;
    const snapshot = cloneJson(revision.snapshot);
    const confidence = evaluateConfidence(schema, snapshot, schema.generationOrder?.length ?? 1);
    await applyUpdatedProfile(
      snapshot,
      'revert',
      `Revert to revision ${revision.id.slice(0, 8)}`,
      {
        confidence,
        parentRevisionId: profile.activeRevisionId,
      }
    );
    toast('Reverted', `Reverted to ${formatDate(revision.createdAt)}.`, 'success');
  };

  const handleFork = async (revision?: ProfileRevision) => {
    const sourceRevision = revision ?? revisions[revisions.length - 1];
    const snapshot = cloneJson(sourceRevision?.snapshot ?? profile.profile);
    const now = new Date().toISOString();
    const forkRevisionId = generateId();

    const forked: GeneratedProfile = {
      ...profile,
      id: generateId(),
      generatedAt: now,
      profile: snapshot,
      revisions: [
        ...(profile.revisions ?? []),
        {
          id: forkRevisionId,
          createdAt: now,
          kind: 'fork',
          prompt: `Forked from ${profile.id.slice(0, 8)} revision ${sourceRevision?.id.slice(0, 8) ?? 'latest'}`,
          snapshot,
          parentRevisionId: sourceRevision?.id,
        },
      ],
      activeRevisionId: forkRevisionId,
    };
    await addProfile(forked);
    onProfileUpdated?.(forked);
    toast('Fork created', 'A new profile branch was added to Profiles.', 'success');
  };

  const pipeline = [
    'Interpret brief',
    'Regenerate target',
    'Consistency pass',
    'Finalize JSON',
  ];

  const isBlocked = disabled || isRefining;
  const openChatWithCurrentProfile = async () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (schema) {
      const serialized = JSON.stringify(fieldDraft);
      if (serialized !== lastPersistedSnapshotRef.current) {
        autosavePendingRef.current = {
          snapshot: cloneJson(fieldDraft),
          serialized,
          profile: profileRef.current,
          schema,
        };
      }
    }
    if (autosavePendingRef.current) {
      await flushAutosave();
    }
    setActiveProfile(profile.id);
    setActiveView('chat');
  };
  const saveProfileJson = async () => {
    const displayName = resolveProfileDisplayName(fieldDraft, { schema, fallback: profile.schemaName || 'character' });
    const safeName = toSafeFileName(displayName) || 'character';
    const defaultFileName = `${safeName}-${profile.id.slice(0, 8)}.json`;
    const exportPayload = cloneJson(fieldDraft);

    try {
      const savedPath = await storage.saveJsonWithDialog(defaultFileName, exportPayload);
      if (savedPath) {
        toast('Profile saved', 'Character JSON saved successfully.', 'success');
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Failed to save profile JSON.';
      toast('Save failed', message, 'error');
    }
  };

  if (!schema) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            AI workspace unavailable because this profile&apos;s schema could not be found.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {candidateProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <GitBranch className="h-4 w-4" />
              Diff Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {candidateConfidence && <ConfidenceStrip confidence={candidateConfidence} />}
            {candidateDiffPaths.length === 0 ? (
              <p className="text-sm text-muted-foreground">No profile changes detected.</p>
            ) : (
              <div className="space-y-2">
                {candidateDiffPaths.map((path) => {
                  const before = getPathValue(fieldDraft, path);
                  const after = getPathValue(candidateProfile, path);
                  const selected = selectedDiffPaths.includes(path);
                  return (
                    <div key={path} className="rounded-md border border-border p-2 space-y-1">
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleDiffPath(path)}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        {path}
                      </label>
                      <div className="text-[11px] text-muted-foreground">
                        <span className="text-destructive/80">before:</span> {truncate(renderValue(before), 180)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        <span className="text-emerald-300">after:</span> {truncate(renderValue(after), 180)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleAcceptAll} disabled={isRefining}>
                <CheckCircle2 className="h-4 w-4" />
                Accept All
              </Button>
              <Button variant="outline" onClick={handleAcceptSelected} disabled={isRefining || selectedDiffPaths.length === 0}>
                Accept Selected
              </Button>
              <Button variant="ghost" onClick={handleRejectCandidate} disabled={isRefining}>
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <WandSparkles className="h-4 w-4" />
              Character
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => void saveProfileJson()}
                className="h-8"
              >
                <Download className="h-3.5 w-3.5" />
                Save .json
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openChatWithCurrentProfile()}
                className="h-8"
              >
                <MessagesSquare className="h-3.5 w-3.5" />
                Chat
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Fields</div>
            <div className="space-y-3">
              {fieldOptions.map((field) => {
                const value = fieldDraft[field.path];
                const selected = selectedFields.includes(field.path);
                const locked = lockedFields.includes(field.path);
                const schemaField = field.schemaField;

                return (
                  <div key={field.path} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{field.label}</p>
                        <p className="text-[11px] text-muted-foreground">{field.path}</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <button
                          onClick={() => toggleSelection(field.path)}
                          disabled={isBlocked}
                          className={`px-2 py-0.5 rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${
                            selected
                              ? 'border-primary bg-primary/15 text-foreground'
                              : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                          }`}
                          title={selected ? 'Remove from regenerate target' : 'Target this field for regenerate'}
                        >
                          {selected ? 'Targeted' : 'Target'}
                        </button>
                        <button
                          onClick={() => toggleLock(field.path)}
                          disabled={isBlocked}
                          className={`px-2 py-0.5 rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${
                            locked
                              ? 'border-amber-500/70 bg-amber-500/15 text-amber-100'
                              : 'border-border text-muted-foreground hover:border-amber-400/50 hover:text-foreground'
                          }`}
                          title={locked ? 'Unlock field' : 'Lock field from regeneration'}
                        >
                          {locked ? 'Locked' : 'Lock'}
                        </button>
                      </div>
                    </div>

                    <ProfileStructuredFieldInput
                      field={schemaField}
                      value={value}
                      disabled={isBlocked}
                      onChange={(nextValue) => updateFieldDraftValue(field.path, nextValue)}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={useWorkspaceConstraints}
                    onChange={(event) => setUseWorkspaceConstraints(event.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Use current visible field edits as constraints for regenerate
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={autoAcceptChanges}
                    onChange={(event) => setAutoAcceptChanges(event.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Auto-accept changes
                </label>
              </div>
              <div className="text-xs text-muted-foreground">Inline field edits save automatically.</div>
            </div>
          </div>

          {command && (
            <div className="rounded-md border border-border bg-muted/20 p-2.5 text-xs text-muted-foreground">
              {`Last command: ${truncate(command, 160)}`}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">One-click transforms</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadTransformSuggestions()}
                disabled={isBlocked || isSuggesting}
                className="h-7 text-[11px]"
              >
                {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Refresh
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {transformSuggestions.map((transform) => (
                  <button
                    key={transform}
                    onClick={() => {
                      setCommand(transform);
                      void handleRun(transform);
                    }}
                    disabled={isBlocked}
                    className="px-2.5 py-1 rounded-full border border-border bg-muted/30 text-xs hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                    title={transform}
                >
                  {truncate(transform, 46)}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground">
            Select target/lock chips on fields, then run a command from the bottom bar.
          </div>

          <div className="space-y-2 border-t border-border/70 pt-3">
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <Badge variant="secondary">Schema: {schema.name}</Badge>
              <Badge variant="outline">Profile: {resolveProfileDisplayName(fieldDraft, { schema, fallback: profile.id.slice(0, 8) })}</Badge>
              <Badge variant="outline">
                Target: {selectedFields.length > 0 ? `${selectedFields.length}` : 'all'}
              </Badge>
              <Badge variant="outline">
                Locks: {lockedFields.length}
              </Badge>
            </div>
            {activeConfidence && <ConfidenceStrip confidence={activeConfidence} />}
          </div>
        </CardContent>
      </Card>

      {pipelineStarted && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="text-xs text-muted-foreground">
              {isRefining
                ? `Running: ${pipeline[pipelineStage] ?? 'Processing'}`
                : 'Latest AI run complete'}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {pipeline.map((stage, index) => {
                const done = pipelineStarted && index < pipelineStage;
                const active = pipelineStarted && index === pipelineStage && isRefining;
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

      <details className="group rounded-md border border-border bg-card">
        <summary className="list-none cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          Advanced Workspace Constraints
        </summary>
        <div className="px-4 pb-4">
          <div className="space-y-3">
            <Textarea
              value={workspaceDraft}
              onChange={(e) => {
                setWorkspaceDraft(e.target.value);
                setWorkspaceError('');
              }}
              className="min-h-[200px] font-mono text-xs"
            />
            {workspaceError && (
              <div className="flex items-center gap-2 text-xs text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" />
                {workspaceError}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={useWorkspaceConstraints}
                onChange={(e) => setUseWorkspaceConstraints(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span className="text-muted-foreground">Use workspace edits as hard constraints on next regenerate.</span>
            </div>
            <Button variant="outline" onClick={() => void handleApplyWorkspace()}>
              Apply Inline Edits
            </Button>
          </div>
        </div>
      </details>

      <details className="group rounded-md border border-border bg-card">
        <summary className="list-none cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          Revision History
        </summary>
        <div className="px-4 pb-4 space-y-2">
          {revisions.length === 0 && (
            <p className="text-sm text-muted-foreground">No revisions yet.</p>
          )}
          {revisions.slice().reverse().map((revision) => (
            <div key={revision.id} className="rounded-md border border-border p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs">
                  <span className="font-medium uppercase tracking-wide">{revision.kind}</span>
                  <span className="text-muted-foreground ml-2">{formatDate(revision.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => void handleRevert(revision)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Revert
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => void handleFork(revision)}>
                    <GitBranch className="h-3.5 w-3.5" />
                    Fork
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{truncate(revision.prompt, 180)}</p>
              {revision.confidence && <ConfidenceStrip confidence={revision.confidence} />}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
