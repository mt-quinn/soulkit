import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProfileStore } from '@/stores/profileStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLlmBarStore } from '@/stores/llmBarStore';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { toast } from '@/stores/toastStore';
import { cn } from '@/lib/utils';
import { resolveGeneratedProfileDisplayName } from '@/lib/profileIdentity';
import { generateCharacterReply, generateSceneFromSchema, type ChatTurn } from '@/services/chat';
import { AlertCircle, Loader2, MessagesSquare, Sparkles } from 'lucide-react';

interface ChatPanelProps {
  isActive?: boolean;
}

export function ChatPanel({ isActive = true }: ChatPanelProps) {
  const { profiles, activeProfile } = useProfileStore();
  const { presets } = useSchemaStore();
  const { hasApiKey, getApiKey } = useSettingsStore();
  const { setConfig, resetConfig } = useLlmBarStore();

  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [scene, setScene] = useState('');
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [isGeneratingScene, setIsGeneratingScene] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const lastSelectedProfile = useRef<string>('');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  const schemaById = useMemo(() => {
    return new Map(presets.map((schema) => [schema.id, schema]));
  }, [presets]);

  const selectedProfile = useMemo(
    () => profileById.get(selectedProfileId) ?? null,
    [profileById, selectedProfileId]
  );
  const selectedSchema = useMemo(
    () => (selectedProfile ? schemaById.get(selectedProfile.schemaId) ?? null : null),
    [schemaById, selectedProfile]
  );

  const selectedDisplayName = useMemo(() => {
    if (!selectedProfile) return '';
    return resolveGeneratedProfileDisplayName(selectedProfile, {
      schema: selectedSchema,
      fallback: selectedProfile.schemaName,
    });
  }, [selectedProfile, selectedSchema]);

  const profileOptions = useMemo(
    () => profiles.map((profile) => {
      const schema = schemaById.get(profile.schemaId) ?? null;
      const name = resolveGeneratedProfileDisplayName(profile, { schema, fallback: profile.schemaName });
      return {
        value: profile.id,
        label: `${name} · ${profile.schemaName}`,
      };
    }),
    [profiles, schemaById]
  );

  useEffect(() => {
    if (profiles.length === 0) {
      if (selectedProfileId) setSelectedProfileId('');
      return;
    }

    const hasSelection = selectedProfileId && profiles.some((profile) => profile.id === selectedProfileId);
    if (hasSelection) return;

    if (activeProfile && profiles.some((profile) => profile.id === activeProfile.id)) {
      setSelectedProfileId(activeProfile.id);
      return;
    }

    setSelectedProfileId(profiles[0].id);
  }, [profiles, activeProfile, selectedProfileId]);

  useEffect(() => {
    if (!selectedProfileId) return;
    if (!lastSelectedProfile.current) {
      lastSelectedProfile.current = selectedProfileId;
      return;
    }
    if (lastSelectedProfile.current !== selectedProfileId) {
      setMessages([]);
      lastSelectedProfile.current = selectedProfileId;
    }
  }, [selectedProfileId]);

  useEffect(() => {
    if (messages.length === 0) return;
    const element = scrollContainerRef.current;
    if (!element) return;
    requestAnimationFrame(() => {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, [messages.length]);

  const handleGenerateScene = useCallback(async () => {
    if (!selectedProfile) {
      toast('No character selected', 'Choose a character before generating context.', 'error');
      return;
    }
    if (!hasApiKey()) {
      toast('No API key', 'Add your OpenAI API key in Settings.', 'error');
      return;
    }

    setIsGeneratingScene(true);
    try {
      const nextScene = await generateSceneFromSchema({
        apiKey: getApiKey(),
        profile: selectedProfile,
        schema: selectedSchema,
        onToken: () => {},
      });
      setScene(nextScene);
      setMessages([]);
      toast('Context generated', 'A concise conversation context is ready.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate context.';
      toast('Context generation failed', message, 'error');
    } finally {
      setIsGeneratingScene(false);
    }
  }, [selectedProfile, selectedSchema, hasApiKey, getApiKey]);

  const handleSendMessage = useCallback(async (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    if (!selectedProfile) {
      toast('No character selected', 'Pick a character to chat with.', 'error');
      return;
    }
    if (!hasApiKey()) {
      toast('No API key', 'Add your OpenAI API key in Settings.', 'error');
      return;
    }
    if (isSending) return;

    const history = [...messages];
    setMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    setIsSending(true);

    try {
      const reply = await generateCharacterReply({
        apiKey: getApiKey(),
        profile: selectedProfile,
        schema: selectedSchema,
        scene,
        history,
        userMessage: prompt,
        onToken: () => {},
      });

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send chat message.';
      toast('Chat failed', message, 'error');
    } finally {
      setIsSending(false);
    }
  }, [selectedProfile, selectedSchema, scene, hasApiKey, getApiKey, isSending, messages]);

  useEffect(() => {
    if (!isActive) return;

    const chips = [
      { id: 'view', label: 'Chat' },
      { id: 'character', label: selectedDisplayName ? `Character: ${selectedDisplayName}` : 'Character required' },
      { id: 'schema', label: selectedProfile ? `Schema: ${selectedProfile.schemaName}` : 'Schema unavailable' },
      { id: 'scene', label: scene.trim() ? 'Context: Ready' : 'Context: Optional' },
    ];

    if (profiles.length === 0) {
      setConfig({
        chips,
        placeholder: 'Create a character first, then return here.',
        submitLabel: 'Send',
        disabled: true,
        disabledReason: 'No characters exist yet.',
        busy: false,
        onSubmit: undefined,
      });
      return;
    }

    if (!hasApiKey()) {
      setConfig({
        chips,
        placeholder: 'Add your OpenAI key in Settings to chat.',
        submitLabel: 'Send',
        disabled: true,
        disabledReason: 'Open Settings and add an API key.',
        busy: false,
        onSubmit: undefined,
      });
      return;
    }

    if (!selectedProfile) {
      setConfig({
        chips,
        placeholder: 'Select a character to begin.',
        submitLabel: 'Send',
        disabled: true,
        disabledReason: 'Choose a character first.',
        busy: false,
        onSubmit: undefined,
      });
      return;
    }

    setConfig({
      chips,
      placeholder: `Message ${selectedDisplayName || 'character'}...`,
      submitLabel: 'Send',
      disabled: false,
      disabledReason: undefined,
      busy: isSending || isGeneratingScene,
      onSubmit: handleSendMessage,
    });
  }, [
    profiles.length,
    selectedProfile,
    selectedDisplayName,
    scene,
    isActive,
    hasApiKey,
    isSending,
    isGeneratingScene,
    setConfig,
    handleSendMessage,
  ]);

  useEffect(() => {
    if (!isActive) return;
    return () => resetConfig();
  }, [isActive, resetConfig]);

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Chat</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a character, set optional context, then use the command bar for direct 1:1 chat.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Session Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Character</label>
              <Select
                value={selectedProfileId}
                onValueChange={setSelectedProfileId}
                placeholder="Select a character..."
                options={profileOptions}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">Context (Optional)</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleGenerateScene()}
                  disabled={isGeneratingScene || !selectedProfile}
                >
                  {isGeneratingScene ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generating
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate Context
                    </span>
                  )}
                </Button>
              </div>
              <Textarea
                value={scene}
                onChange={(event) => setScene(event.target.value)}
                placeholder="Optional: add 1-2 short sentences of context for this conversation."
                className="min-h-[140px] text-sm leading-relaxed"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <Badge variant="secondary">Mode: Character Chat</Badge>
                {selectedProfile && <Badge variant="outline">{selectedProfile.schemaName}</Badge>}
                {messages.length > 0 && <Badge variant="outline">{messages.length} messages</Badge>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMessages([]);
                }}
                disabled={messages.length === 0}
              >
                Clear Chat
              </Button>
            </div>
          </CardContent>
        </Card>

        {!hasApiKey() && (
          <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 rounded-md p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>No API key configured for OpenAI. Add one in Settings.</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {messages.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No messages yet. Use the bottom command bar to send the first message.
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={cn(
                      'flex',
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg border px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
                        message.role === 'user'
                          ? 'border-primary/40 bg-primary/10 text-foreground'
                          : 'border-border bg-muted/40 text-foreground'
                      )}
                    >
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {message.role === 'user' ? 'You' : selectedDisplayName || 'Character'}
                      </div>
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isSending && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {selectedDisplayName || 'Character'} is replying...
              </div>
            )}
          </CardContent>
        </Card>

        {profiles.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground inline-flex items-center gap-2">
            <MessagesSquare className="h-4 w-4" />
            Create a character in the Create tab before using Chat.
          </div>
        )}
      </div>
    </div>
  );
}
