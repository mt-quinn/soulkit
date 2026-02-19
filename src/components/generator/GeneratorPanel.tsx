import { useState, useCallback } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProfileStore } from '@/stores/profileStore';
import { generateProfile } from '@/services/provider';
import { FIXED_MODEL_NAME, FIXED_PROVIDER, FIXED_PROVIDER_NAME, FIXED_TEMPERATURE } from '@/services/types';
import { isMultiPass } from '@/lib/promptBuilder';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/stores/toastStore';
import { generateId } from '@/lib/utils';
import type { GeneratedProfile } from '@/types';
import { Sparkles, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { ProfileViewer } from '@/components/profile/ProfileViewer';
import { ProfileRefinePanel } from '@/components/profile/ProfileRefinePanel';
import { evaluateConfidence } from '@/lib/workspace';

export function GeneratorPanel() {
  const { presets } = useSchemaStore();
  const { hasApiKey, getApiKey } = useSettingsStore();
  const {
    isGenerating,
    currentPass,
    totalPasses,
    currentPassKeys,
    setGenerating,
    setPassInfo,
    addProfile,
  } = useProfileStore();

  const [selectedSchemaId, setSelectedSchemaId] = useState<string>('');
  const [userInput, setUserInput] = useState('');
  const [lastProfile, setLastProfile] = useState<GeneratedProfile | null>(null);

  const selectedSchema = presets.find((p) => p.id === selectedSchemaId);
  const providerHasKey = hasApiKey();
  const multiPass = selectedSchema ? isMultiPass(selectedSchema) : false;

  const handleSchemaChange = (id: string) => {
    setSelectedSchemaId(id);
  };

  const handleGenerate = useCallback(async () => {
    if (!selectedSchema) {
      toast('No schema selected', 'Please select a schema preset first.', 'error');
      return;
    }
    if (!providerHasKey) {
      toast('No API key', 'Please add your OpenAI API key in Settings.', 'error');
      return;
    }
    if (!userInput.trim()) {
      toast('No brief provided', 'Describe what you want in plain text.', 'error');
      return;
    }

    const apiKey = getApiKey();
    setGenerating(true);
    setLastProfile(null);

    try {
      await new Promise<void>((resolve, reject) => {
        generateProfile(apiKey, selectedSchema, userInput.trim(), {
          onPassStart: (passIndex, passTotal, fieldKeys) => {
            setPassInfo(passIndex, passTotal, fieldKeys);
          },
          onToken: () => {},
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
              prompt: userInput.trim(),
              temperature: FIXED_TEMPERATURE,
              profile: result.profile,
              revisions: [
                {
                  id: revisionId,
                  createdAt: now,
                  kind: 'generate',
                  prompt: userInput.trim(),
                  snapshot: result.profile,
                  confidence: evaluateConfidence(selectedSchema, result.profile, selectedSchema.generationOrder?.length ?? 1),
                },
              ],
              activeRevisionId: revisionId,
            };
            await addProfile(profile);
            setLastProfile(profile);
            toast(
              'Profile generated',
              `${selectedSchema.name} created and saved to History.`,
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
      setGenerating(false);
      setPassInfo(0, 1, []);
    }
  }, [selectedSchema, providerHasKey, userInput, getApiKey, setGenerating, setPassInfo, addProfile]);

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full grid grid-cols-[minmax(360px,440px)_1fr]">
        <div className="h-full overflow-y-auto border-r border-border">
          <div className="p-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold">Generate</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Pick a schema, describe what you want, and generate.
              </p>
            </div>

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

            <Card>
              <CardHeader>
                <CardTitle>Character Brief</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  className="min-h-[180px] text-sm"
                  placeholder="Describe the character you want. Include personality, tone, role, constraints, and any must-have details."
                />
                <p className="text-xs text-muted-foreground">
                  The model will fill all schema fields from this brief only.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Model Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">{FIXED_PROVIDER_NAME}</Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="outline">{FIXED_MODEL_NAME}</Badge>
                  <Badge variant="outline">T: {FIXED_TEMPERATURE.toFixed(2)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Runtime is fixed for consistency.
                </p>
              </CardContent>
            </Card>

            {!providerHasKey && (
              <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 rounded-md p-3">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>No API key configured for OpenAI. Add one in Settings.</span>
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !selectedSchema || !providerHasKey || !userInput.trim()}
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
                  Generate Profile
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="h-full overflow-y-auto p-6 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {isGenerating
                    ? totalPasses > 1
                      ? `Pass ${currentPass + 1} of ${totalPasses}`
                      : 'Generating'
                    : lastProfile
                      ? 'Latest Result'
                      : 'Output'}
                </CardTitle>
                {totalPasses > 1 && isGenerating && (
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
              {totalPasses > 1 && isGenerating && currentPassKeys.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Generating: {currentPassKeys.join(', ')}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {isGenerating ? (
                <p className="text-sm text-muted-foreground">
                  Streaming raw tokens in the Console popup.
                </p>
              ) : lastProfile ? (
                <p className="text-sm text-muted-foreground">
                  Latest profile generated successfully.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Submit a character brief to generate a profile.
                </p>
              )}
            </CardContent>
          </Card>

          {lastProfile && (
            <Card>
              <CardContent className="pt-6">
                <ProfileViewer profile={lastProfile} />
              </CardContent>
            </Card>
          )}

          {lastProfile && (
            <ProfileRefinePanel
              profile={lastProfile}
              onProfileUpdated={setLastProfile}
              disabled={isGenerating}
            />
          )}
        </div>
      </div>
    </div>
  );
}
