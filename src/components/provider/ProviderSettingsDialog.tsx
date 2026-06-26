import { useEffect, useState } from "react";
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";

import { useProvidersStore } from "@/stores/providersStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface ProviderFormValues {
  name: string;
  baseUrl: string;
  apiKey: string;
}

const SAMPLE_PRESETS: { name: string; baseUrl: string }[] = [
  { name: "Ollama (local)", baseUrl: "http://localhost:11434" },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { name: "LM Studio (local)", baseUrl: "http://localhost:1234/v1" },
];

interface EditorState {
  mode: "create" | "edit";
  providerId?: string;
  values: ProviderFormValues;
}

const EMPTY: ProviderFormValues = { name: "", baseUrl: "", apiKey: "" };

export function ProviderSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
    providers,
    modelsByProvider,
    refreshing,
    refreshModels,
    removeProvider,
  } = useProvidersStore();
  const [editor, setEditor] = useState<EditorState | null>(null);

  const closeEditor = () => setEditor(null);

  if (editor) {
    return (
      <ProviderEditor
        state={editor}
        onClose={closeEditor}
        onSaved={closeEditor}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" /> Providers
          </DialogTitle>
          <DialogDescription>
            Configure OpenAI-compatible API endpoints. Models are fetched
            automatically for dropdowns.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {SAMPLE_PRESETS.map((p) => (
            <Button
              key={p.name}
              variant="outline"
              size="sm"
              onClick={() =>
                setEditor({
                  mode: "create",
                  values: {
                    name: p.name,
                    baseUrl: p.baseUrl,
                    apiKey: "",
                  },
                })
              }
            >
              <Plus className="h-3.5 w-3.5" /> {p.name}
            </Button>
          ))}
        </div>

        <Separator />

        <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
          {providers.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No providers yet. Add one above to get started.
            </div>
          )}
          {providers.map((p) => {
            const modelCount = modelsByProvider[p.id]?.length ?? 0;
            const isRefreshing = refreshing[p.id];
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.name}</span>
                    <Badge variant="secondary">
                      {modelCount > 0
                        ? `${modelCount} models`
                        : "no models"}
                    </Badge>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.baseUrl}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={isRefreshing}
                  onClick={() => refreshModels(p.id)}
                  title="Fetch models"
                >
                  {isRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setEditor({
                      mode: "edit",
                      providerId: p.id,
                      values: {
                        name: p.name,
                        baseUrl: p.baseUrl,
                        apiKey: p.apiKey ?? "",
                      },
                    })
                  }
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (
                      confirm(
                        `Delete provider "${p.name}"? Its cached models will be removed.`
                      )
                    ) {
                      removeProvider(p.id);
                    }
                  }}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between pt-1">
          <Button
            variant="outline"
            onClick={() =>
              setEditor({ mode: "create", values: { ...EMPTY } })
            }
          >
            <Plus className="h-4 w-4" /> Custom provider
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProviderEditor({
  state,
  onClose,
  onSaved,
}: {
  state: EditorState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addProvider, updateProvider, refreshModels } = useProvidersStore();
  const [values, setValues] = useState<ProviderFormValues>(state.values);
  const [fetchOnSave, setFetchOnSave] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues(state.values);
    setError(null);
  }, [state]);

  const canSave =
    values.name.trim() && values.baseUrl.trim() && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const trimmed = values.baseUrl.trim().replace(/\/+$/, "");
      const apiKey = values.apiKey.trim() || null;
      if (state.mode === "create") {
        const p = await addProvider({
          name: values.name.trim(),
          baseUrl: trimmed,
          apiKey,
        });
        if (fetchOnSave) refreshModels(p.id).catch(() => {});
      } else if (state.providerId) {
        await updateProvider(state.providerId, {
          name: values.name.trim(),
          baseUrl: trimmed,
          apiKey,
        });
        if (fetchOnSave) refreshModels(state.providerId).catch(() => {});
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save provider");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state.mode === "create" ? "Add provider" : "Edit provider"}
          </DialogTitle>
          <DialogDescription>
            Any endpoint implementing the OpenAI-compatible API
            (<code>/v1/models</code> &amp; <code>/v1/chat/completions</code>).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              placeholder="e.g. My local Ollama"
              value={values.name}
              onChange={(e) =>
                setValues((v) => ({ ...v, name: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-url">Base URL</Label>
            <Input
              id="p-url"
              placeholder="http://localhost:11434 or https://api.openai.com/v1"
              value={values.baseUrl}
              onChange={(e) =>
                setValues((v) => ({ ...v, baseUrl: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Include <code>/v1</code> if your endpoint exposes a version path.
              We'll append <code>/v1</code> automatically otherwise.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-key">API key</Label>
            <Input
              id="p-key"
              type="password"
              placeholder="Optional for local servers"
              value={values.apiKey}
              onChange={(e) =>
                setValues((v) => ({ ...v, apiKey: e.target.value }))
              }
            />
          </div>

          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
            )}
          >
            <input
              type="checkbox"
              checked={fetchOnSave}
              onChange={(e) => setFetchOnSave(e.target.checked)}
              className="accent-foreground"
            />
            Fetch models after saving
          </label>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={handleSave}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {state.mode === "create" ? "Add provider" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
