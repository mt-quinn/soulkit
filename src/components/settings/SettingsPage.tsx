import { useState, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { toast } from '@/stores/toastStore';
import { Eye, EyeOff, Sun, Moon, Monitor } from 'lucide-react';
import type { LLMProvider, AppSettings } from '@/types';

const providers: { id: LLMProvider; name: string; placeholder: string }[] = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'gemini', name: 'Google Gemini', placeholder: 'AI...' },
];

const themeOptions: { value: AppSettings['theme']; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function SettingsPage() {
  const { settings, setApiKey, setTheme, saveSettings } = useSettingsStore();
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({
    openai: settings.apiKeys.openai,
    anthropic: settings.apiKeys.anthropic,
    gemini: settings.apiKeys.gemini,
  });

  useEffect(() => {
    setKeyInputs({
      openai: settings.apiKeys.openai,
      anthropic: settings.apiKeys.anthropic,
      gemini: settings.apiKeys.gemini,
    });
  }, [settings.apiKeys]);

  const toggleVisible = (id: string) =>
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleSaveKey = async (provider: LLMProvider) => {
    const value = keyInputs[provider]?.trim() ?? '';
    await setApiKey(provider, value);
    toast('API key saved', `${provider} key has been updated.`, 'success');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold">Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure API keys and app preferences.
          </p>
        </div>

        {/* Theme */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose your preferred theme.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors cursor-pointer
                    ${settings.theme === value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Enter your API keys for each provider. Keys are stored locally on your machine.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {providers.map(({ id, name, placeholder }) => (
              <div key={id} className="space-y-2">
                <label className="text-sm font-medium">{name}</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={visibleKeys[id] ? 'text' : 'password'}
                      placeholder={placeholder}
                      value={keyInputs[id] ?? ''}
                      onChange={(e) =>
                        setKeyInputs((prev) => ({ ...prev, [id]: e.target.value }))
                      }
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisible(id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      {visibleKeys[id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSaveKey(id)}
                    className="shrink-0"
                  >
                    Save
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Defaults */}
        <Card>
          <CardHeader>
            <CardTitle>Defaults</CardTitle>
            <CardDescription>Set default generation preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Default Provider</label>
              <Select
                value={settings.defaultProvider}
                onValueChange={(v) => saveSettings({ defaultProvider: v as LLMProvider })}
                options={providers.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Default Temperature</label>
                <span className="text-sm text-muted-foreground font-mono">
                  {settings.defaultTemperature.toFixed(1)}
                </span>
              </div>
              <Slider
                value={settings.defaultTemperature}
                onValueChange={(v) => saveSettings({ defaultTemperature: v })}
                min={0}
                max={2}
                step={0.1}
              />
              <p className="text-xs text-muted-foreground">
                Lower = more focused and deterministic. Higher = more creative and random.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
