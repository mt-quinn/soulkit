import { useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { toast } from '@/stores/toastStore';
import { Eye, EyeOff, Sun, Moon, Monitor } from 'lucide-react';
import type { AppSettings } from '@/types';
import { FIXED_MODEL_NAME, FIXED_PROVIDER_NAME, FIXED_TEMPERATURE } from '@/services/types';

const themeOptions: { value: AppSettings['theme']; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function SettingsPage() {
  const { settings, setApiKey, setTheme } = useSettingsStore();
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [openaiKeyInput, setOpenaiKeyInput] = useState(settings.apiKeys.openai);

  const toggleVisible = (id: string) =>
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleSaveOpenAiKey = async () => {
    const value = openaiKeyInput.trim();
    await setApiKey(value);
    toast('API key saved', 'OpenAI key has been updated.', 'success');
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
            <CardTitle>API Key</CardTitle>
            <CardDescription>
              Enter your OpenAI API key. It is stored locally on your machine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <label className="text-sm font-medium">OpenAI</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={visibleKeys.openai ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={openaiKeyInput}
                    onChange={(e) => setOpenaiKeyInput(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleVisible('openai')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    {visibleKeys.openai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveOpenAiKey}
                  className="shrink-0"
                >
                  Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Runtime */}
        <Card>
          <CardHeader>
            <CardTitle>Model Runtime</CardTitle>
            <CardDescription>
              Runtime is intentionally fixed for consistency.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="font-medium">Provider:</span> {FIXED_PROVIDER_NAME}</p>
            <p><span className="font-medium">Model:</span> {FIXED_MODEL_NAME}</p>
            <p><span className="font-medium">Temperature:</span> {FIXED_TEMPERATURE.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
