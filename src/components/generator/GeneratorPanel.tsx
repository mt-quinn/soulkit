import { useState, useCallback } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProfileStore } from '@/stores/profileStore';
import { generateProfile } from '@/services/provider';
import { PROVIDER_CONFIGS, getModelsForProvider, getDefaultModel } from '@/services/types';
import { isMultiPass } from '@/lib/promptBuilder';
import { SeedForm } from './SeedForm';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/stores/toastStore';
import { generateId } from '@/lib/utils';
import type { LLMProvider, GeneratedProfile } from '@/types';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';

export function GeneratorPanel() {
  const { presets } = useSchemaStore();
  const { settings, hasApiKey, getApiKey } = useSettingsStore();
  const {
    isGenerating,
    streamContent,
    currentPass,
    totalPasses,
    currentPassKeys,
    setGenerating,
    setStreamContent,
    appendStreamContent,
    setPassInfo,
    resetGenerationState,
    addProfile,
  } = useProfileStore();

  const [selectedSchemaId, setSelectedSchemaId] = useState<string>('');
  const [provider, setProvider] = useState<LLMProvider>(settings.defaultProvider);
  const [model, setModel] = useState<string>(getDefaultModel(settings.defaultProvider));
  const [temperature, setTemperature] = useState(settings.defaultTemperature);
  const [seeds, setSeeds] = useState<Record<string, unknown>>({});
  const [batchSize, setBatchSize] = useState(1);

  const selectedSchema = presets.find((p) => p.id === selectedSchemaId);
  const providerHasKey = hasApiKey(provider);
  const multiPass = selectedSchema ? isMultiPass(selectedSchema) : false;

  const handleProviderChange = (p: LLMProvider) => {
    setProvider(p);
    setModel(getDefaultModel(p));
  };

  const handleSchemaChange = (id: string) => {
    setSelectedSchemaId(id);
    setSeeds({});
  };

  const clearSeeds = () => setSeeds({});

  const flattenSeeds = (seeds: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(seeds)) {
      if (value === '' || value === undefined || value === null) continue;
      const parts = key.split('.');
      let current: Record<string, unknown> = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    }
    return result;
  };

  const handleGenerate = useCallback(async () => {
    if (!selectedSchema) {
      toast('No schema selected', 'Please select a schema preset first.', 'error');
      return;
    }
    if (!providerHasKey) {
      toast('No API key', `Please add your ${PROVIDER_CONFIGS[provider].name} API key in Settings.`, 'error');
      return;
    }

    const apiKey = getApiKey(provider);
    const nestedSeeds = flattenSeeds(seeds);

    for (let i = 0; i < batchSize; i++) {
      setGenerating(true);
      setStreamContent('');

      try {
        await new Promise<void>((resolve, reject) => {
          generateProfile(provider, apiKey, model, selectedSchema, nestedSeeds, temperature, {
            onPassStart: (passIndex, passTotal, fieldKeys) => {
              setPassInfo(passIndex, passTotal, fieldKeys);
              if (passIndex > 0) {
                // Add separator between passes in stream view
                appendStreamContent(`\n\n--- Pass ${passIndex + 1}/${passTotal} ---\n\n`);
              }
            },
            onToken: (token) => {
              appendStreamContent(token);
            },
            onPassComplete: (_passIndex, _partialProfile) => {
              // Could update a live preview here
            },
            onComplete: async (result) => {
              const profile: GeneratedProfile = {
                id: generateId(),
                schemaId: selectedSchema.id,
                schemaName: selectedSchema.name,
                provider,
                model,
                generatedAt: new Date().toISOString(),
                seeds: nestedSeeds,
                temperature,
                profile: result.profile,
              };
              await addProfile(profile);
              toast(
                'Profile generated',
                `${selectedSchema.name} created with ${PROVIDER_CONFIGS[provider].name}.`,
                'success'
              );
              resolve();
            },
            onError: (error) => {
              toast('Generation failed', error, 'error');
              reject(new Error(error));
            },
          });
        });
      } catch {
        // Error already handled via toast
      } finally {
        resetGenerationState();
      }
    }
  }, [selectedSchema, provider, model, temperature, seeds, batchSize, providerHasKey]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold">Generate</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create character profiles using AI.
          </p>
        </div>

        {/* Schema Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Schema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Select
              value={selectedSchemaId}
              onValueChange={handleSchemaChange}
              placeholder="Select a schema preset..."
              options={presets.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.fields.length} fields)`,
              }))}
            />
            {selectedSchema && (
              <div className="flex flex-wrap gap-1.5">
                {multiPass && (
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedSchema.generationOrder!.length}-pass generation
                  </Badge>
                )}
                {selectedSchema.specificity && (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {selectedSchema.specificity} specificity
                  </Badge>
                )}
                {selectedSchema.examples && selectedSchema.examples.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {selectedSchema.examples.length} example{selectedSchema.examples.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Provider & Model */}
        <Card>
          <CardHeader>
            <CardTitle>Provider & Model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Provider</label>
                <Select
                  value={provider}
                  onValueChange={(v) => handleProviderChange(v as LLMProvider)}
                  options={Object.values(PROVIDER_CONFIGS).map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                <Select
                  value={model}
                  onValueChange={setModel}
                  options={getModelsForProvider(provider).map((m) => ({
                    value: m.id,
                    label: m.name,
                  }))}
                />
              </div>
            </div>

            {!providerHasKey && (
              <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 rounded-md p-3">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>No API key configured for {PROVIDER_CONFIGS[provider].name}. Add one in Settings.</span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Temperature</label>
                <span className="text-xs font-mono text-muted-foreground">{temperature.toFixed(1)}</span>
              </div>
              <Slider value={temperature} onValueChange={setTemperature} min={0} max={2} step={0.1} />
            </div>
          </CardContent>
        </Card>

        {/* Seed Values */}
        {selectedSchema && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Seed Values</CardTitle>
                {Object.keys(seeds).length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearSeeds} className="h-6 text-xs">Clear all</Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <SeedForm fields={selectedSchema.fields} seeds={seeds} onSeedsChange={setSeeds} />
            </CardContent>
          </Card>
        )}

        {/* Batch Size */}
        <Card>
          <CardHeader>
            <CardTitle>Batch</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground">Generate</label>
              <Select
                value={batchSize.toString()}
                onValueChange={(v) => setBatchSize(parseInt(v))}
                options={[1, 2, 3, 5, 10].map((n) => ({
                  value: n.toString(),
                  label: `${n} profile${n > 1 ? 's' : ''}`,
                }))}
                className="w-36"
              />
            </div>
          </CardContent>
        </Card>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !selectedSchema || !providerHasKey}
          size="lg"
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate {batchSize > 1 ? `${batchSize} Profiles` : 'Profile'}
            </>
          )}
        </Button>

        {/* Stream Preview with Pass Progress */}
        {isGenerating && streamContent && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {totalPasses > 1 ? `Pass ${currentPass + 1} of ${totalPasses}` : 'Generating...'}
                </CardTitle>
                {totalPasses > 1 && (
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: totalPasses }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 w-6 rounded-full transition-colors ${
                          i < currentPass ? 'bg-primary' : i === currentPass ? 'bg-primary animate-pulse' : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
              {totalPasses > 1 && currentPassKeys.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Generating: {currentPassKeys.join(', ')}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-64 overflow-y-auto">
                {streamContent}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
