import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProfileStore } from '@/stores/profileStore';
import { useLlmBarStore } from '@/stores/llmBarStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { generateProfile } from '@/services/provider';
import { FIXED_MODEL_NAME, FIXED_PROVIDER, FIXED_PROVIDER_NAME, FIXED_TEMPERATURE } from '@/services/types';
import { isMultiPass } from '@/lib/promptBuilder';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { toast } from '@/stores/toastStore';
import { evaluateConfidence } from '@/lib/workspace';
import { generateId } from '@/lib/utils';
import type { GeneratedProfile } from '@/types';
import { AlertCircle } from 'lucide-react';

interface StudioPanelProps {
  isActive?: boolean;
}

export function StudioPanel({ isActive = true }: StudioPanelProps) {
  const { presets } = useSchemaStore();
  const { hasApiKey, getApiKey } = useSettingsStore();
  const { setConfig, resetConfig } = useLlmBarStore();
  const { setActiveView } = useNavigationStore();
  const {
    isGenerating,
    setGenerating,
    addProfile,
    setActiveProfile,
  } = useProfileStore();

  const [selectedSchemaId, setSelectedSchemaId] = useState('');

  const selectedSchema = useMemo(
    () => presets.find((preset) => preset.id === selectedSchemaId) ?? null,
    [presets, selectedSchemaId]
  );
  const providerHasKey = hasApiKey();
  const multiPass = selectedSchema ? isMultiPass(selectedSchema) : false;

  useEffect(() => {
    if (presets.length === 0) {
      if (selectedSchemaId) setSelectedSchemaId('');
      return;
    }
    if (!selectedSchemaId || !presets.some((preset) => preset.id === selectedSchemaId)) {
      setSelectedSchemaId(presets[0].id);
    }
  }, [presets, selectedSchemaId]);

  const handleGenerate = useCallback(async (prompt: string) => {
    const trimmedPrompt = prompt.trim();
    const promptForHistory = trimmedPrompt || 'Random character from schema.';

    if (!selectedSchema) {
      toast('No schema selected', 'Choose a schema before generating.', 'error');
      return;
    }
    if (!providerHasKey) {
      toast('No API key', 'Add your OpenAI API key in Settings.', 'error');
      return;
    }

    const apiKey = getApiKey();
    setGenerating(true);

    try {
      await new Promise<void>((resolve, reject) => {
        generateProfile(apiKey, selectedSchema, trimmedPrompt, {
          onPassStart: () => {
            // no-op
          },
          onToken: () => {
            // console popup handles raw token stream globally
          },
          onPassComplete: () => {
            // no-op
          },
          onComplete: async (result) => {
            const revisionId = generateId();
            const now = new Date().toISOString();
            const profile: GeneratedProfile = {
              id: generateId(),
              schemaId: selectedSchema.id,
              schemaName: selectedSchema.name,
              provider: FIXED_PROVIDER,
              model: FIXED_MODEL_NAME,
              generatedAt: now,
              seeds: {},
              prompt: promptForHistory,
              temperature: FIXED_TEMPERATURE,
              profile: result.profile,
              revisions: [
                {
                  id: revisionId,
                  createdAt: now,
                  kind: 'generate',
                  prompt: promptForHistory,
                  snapshot: result.profile,
                  confidence: evaluateConfidence(selectedSchema, result.profile, selectedSchema.generationOrder?.length ?? 1),
                },
              ],
              activeRevisionId: revisionId,
            };
            await addProfile(profile);
            setActiveProfile(profile.id);
            toast('Character ready', 'Opening Profiles workspace.', 'success');
            setActiveView('history');
            resolve();
          },
          onError: (error) => {
            toast('Generation failed', error, 'error');
            reject(new Error(error));
          },
        });
      });
    } catch {
      // handled with toast
    } finally {
      setGenerating(false);
    }
  }, [
    selectedSchema,
    providerHasKey,
    getApiKey,
    setGenerating,
    addProfile,
    setActiveProfile,
    setActiveView,
  ]);

  useEffect(() => {
    if (!isActive) return;

    const baseChips = [
      { id: 'view', label: 'Create' },
      { id: 'schema', label: selectedSchema ? `Schema: ${selectedSchema.name}` : 'Schema required' },
      { id: 'mode', label: 'Mode: Generate' },
    ];

    if (!providerHasKey) {
      setConfig({
        chips: baseChips,
        placeholder: 'Add your OpenAI key in Settings to generate.',
        submitLabel: 'Generate',
        disabled: true,
        disabledReason: 'Open Settings and add an API key.',
        busy: false,
        onSubmit: undefined,
      });
      return;
    }

    if (!selectedSchema) {
      setConfig({
        chips: baseChips,
        placeholder: 'Select a schema to continue.',
        submitLabel: 'Generate',
        disabled: true,
        disabledReason: 'Choose a schema first.',
        busy: false,
        onSubmit: undefined,
      });
      return;
    }

    setConfig({
      chips: baseChips,
      placeholder: 'Describe the character (optional). Leave blank for random from schema.',
      submitLabel: 'Generate',
      disabled: false,
      disabledReason: undefined,
      busy: isGenerating,
      allowEmptyPrompt: true,
      onSubmit: handleGenerate,
    });
  }, [handleGenerate, isGenerating, isActive, providerHasKey, selectedSchema, setConfig]);

  useEffect(() => {
    if (!isActive) return;
    return () => resetConfig();
  }, [isActive, resetConfig]);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Create Character</h2>
          <p className="text-sm text-muted-foreground mt-1">
            This screen is generation only. After completion, you are moved to Profiles for review and refinement.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Generation Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Schema</label>
              <Select
                value={selectedSchemaId}
                onValueChange={setSelectedSchemaId}
                placeholder="Select a schema..."
                options={presets.map((preset) => ({
                  value: preset.id,
                  label: `${preset.name} (${preset.fields.length} fields)`,
                }))}
              />
            </div>

            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <Badge variant="secondary">{FIXED_PROVIDER_NAME}</Badge>
              <Badge variant="outline">{FIXED_MODEL_NAME}</Badge>
              <Badge variant="outline">T: {FIXED_TEMPERATURE.toFixed(2)}</Badge>
              {multiPass && selectedSchema?.generationOrder && (
                <Badge variant="outline">{selectedSchema.generationOrder.length}-pass</Badge>
              )}
              {selectedSchema?.specificity && (
                <Badge variant="outline">{selectedSchema.specificity} specificity</Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Brief is optional. Leave it blank to generate a random character from this schema.
            </p>
          </CardContent>
        </Card>

        {!providerHasKey && (
          <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 rounded-md p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>No API key configured for OpenAI. Add one in Settings.</span>
          </div>
        )}
      </div>
    </div>
  );
}
