import { useState } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import type { SchemaField, SchemaPreset } from '@/types';
import { FieldEditor } from './FieldEditor';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { toast } from '@/stores/toastStore';
import { Plus, Copy, Trash2, FileText, Pencil, Layers, BookOpen, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

type EditorTab = 'fields' | 'examples' | 'settings';

export function SchemaEditor() {
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

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('fields');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const preset = await createPreset(newName.trim(), newDescription.trim() || undefined);
    setActivePreset(preset.id);
    setCreateDialogOpen(false);
    setNewName('');
    setNewDescription('');
    toast('Preset created', `"${preset.name}" is ready to edit.`, 'success');
  };

  const handleDuplicate = async (id: string) => {
    const preset = await duplicatePreset(id);
    if (preset) {
      setActivePreset(preset.id);
      toast('Preset duplicated', `Created "${preset.name}".`, 'success');
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    const name = presets.find((p) => p.id === pendingDeleteId)?.name;
    await deletePreset(pendingDeleteId);
    setPendingDeleteId(null);
    setDeleteDialogOpen(false);
    toast('Preset deleted', `"${name}" has been removed.`, 'default');
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

  const tabs: { id: EditorTab; label: string; icon: typeof Layers }[] = [
    { id: 'fields', label: 'Fields', icon: Layers },
    { id: 'examples', label: 'Examples', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-full">
      {/* Preset list sidebar */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Schema Presets</h2>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
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
              onClick={() => setActivePreset(preset.id)}
              onDuplicate={() => handleDuplicate(preset.id)}
              onDelete={() => { setPendingDeleteId(preset.id); setDeleteDialogOpen(true); }}
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
              {activeTab === 'fields' && (
                <Button variant="outline" size="sm" onClick={addField}>
                  <Plus className="h-4 w-4 mr-1" /> Add Field
                </Button>
              )}
            </div>

            {activePreset.description && (
              <p className="text-sm text-muted-foreground">{activePreset.description}</p>
            )}

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
                  <FieldEditor
                    key={`${field.key}-${i}`}
                    field={field}
                    onChange={(updated) => updateField(i, updated)}
                    onDelete={() => deleteField(i)}
                    allFieldKeys={allFieldKeys}
                  />
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
              <p className="text-sm text-muted-foreground mb-4">Select a preset from the sidebar or create a new one.</p>
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
            <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
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
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Preset</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete "{presets.find((p) => p.id === pendingDeleteId)?.name}"? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
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
                const name = (ex.name as string) ?? (ex.full_name as string) ?? `Example ${i + 1}`;
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
  onDuplicate,
  onDelete,
}: {
  preset: SchemaPreset;
  active: boolean;
  onClick: () => void;
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
