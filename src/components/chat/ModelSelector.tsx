import { useMemo, useState } from "react";
import {
  ChevronsUpDown,
  Loader2,
  Pin,
  Search,
  Settings2,
  Star,
} from "lucide-react";

import { useProvidersStore } from "@/stores/providersStore";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ModelEntry } from "@/types";

interface ModelRow {
  providerId: string;
  model: ModelEntry;
}

export function ModelSelector({
  providerId,
  modelId,
  onSelect,
  onOpenProviders,
  className,
}: {
  providerId?: string | null;
  modelId?: string | null;
  onSelect: (providerId: string, modelId: string) => void;
  onOpenProviders: () => void;
  className?: string;
}) {
  const providers = useProvidersStore((s) => s.providers);
  const modelsByProvider = useProvidersStore((s) => s.modelsByProvider);
  const refreshing = useProvidersStore((s) => s.refreshing);
  const refreshModels = useProvidersStore((s) => s.refreshModels);
  const getProvider = useProvidersStore((s) => s.getProvider);
  const toggleModelStar = useProvidersStore((s) => s.toggleModelStar);
  const setDefaultModel = useProvidersStore((s) => s.setDefaultModel);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const provider = providerId ? getProvider(providerId) : undefined;
  const anyRefreshing = Object.values(refreshing).some(Boolean);

  // Build the full flat list of models with their provider id.
  const allRows = useMemo<ModelRow[]>(() => {
    const rows: ModelRow[] = [];
    for (const p of providers) {
      const models = modelsByProvider[p.id] ?? [];
      for (const m of models) {
        rows.push({ providerId: p.id, model: m });
      }
    }
    return rows;
  }, [providers, modelsByProvider]);

  // Starred models shown in a dedicated "Starred" section at the top.
  const starredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter(({ model: m }) => {
      if (!m.starred) return false;
      if (!q) return true;
      return (
        m.modelId.toLowerCase().includes(q) ||
        (m.label ?? "").toLowerCase().includes(q)
      );
    });
  }, [allRows, query]);

  // Provider-grouped models (excluding starred since they're shown at top).
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers
      .map((p) => {
        const models = modelsByProvider[p.id] ?? [];
        const filtered = q
          ? models.filter(
              (m) =>
                m.modelId.toLowerCase().includes(q) ||
                (m.label ?? "").toLowerCase().includes(q)
            )
          : models;
        return { provider: p, models: filtered };
      })
      .filter((g) => g.models.length > 0);
  }, [providers, modelsByProvider, query]);

  const triggerLabel = modelId ? modelId : "Select a model";

  const handleToggleStar = (e: React.MouseEvent, modelDbId: number) => {
    e.stopPropagation();
    void toggleModelStar(modelDbId);
  };

  const handleSetDefault = (e: React.MouseEvent, pid: string, mid: string) => {
    e.stopPropagation();
    void setDefaultModel(pid, mid);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 max-w-[280px] justify-between gap-2 px-3 text-xs",
            className
          )}
        >
          <span className="truncate font-normal">
            {provider && (
              <span className="text-muted-foreground">
                {provider.name}:
              </span>
            )}{" "}
            {triggerLabel}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-0"
      >
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-9 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search models…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="max-h-[320px] overflow-y-auto p-1">
          {providers.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No providers configured.
            </div>
          )}

          {providers.length > 0 &&
            groups.length === 0 &&
            starredRows.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No models found. Refresh a provider to fetch models, or type a
                custom model id below.
              </div>
            )}

          {/* Starred section */}
          {starredRows.length > 0 && (
            <div className="px-1 py-1">
              <div className="px-2 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  ★ Starred
                </span>
              </div>
              {starredRows.map(({ providerId: pid, model: m }) => (
                <ModelRowItem
                  key={`starred:${pid}:${m.modelId}`}
                  modelId={m.modelId}
                  label={m.label || m.modelId}
                  selected={providerId === pid && modelId === m.modelId}
                  isDefault={m.isDefault}
                  starred={m.starred}
                  onSelect={() => {
                    onSelect(pid, m.modelId);
                    setQuery("");
                    setOpen(false);
                  }}
                  onToggleStar={(e) => handleToggleStar(e, m.id)}
                  onSetDefault={(e) => handleSetDefault(e, pid, m.modelId)}
                />
              ))}
            </div>
          )}

          {groups.map(({ provider: p, models }) => (
            <div key={p.id} className="px-1 py-1">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {p.name}
                </span>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => refreshModels(p.id)}
                  title="Refresh models"
                  disabled={refreshing[p.id]}
                >
                  {refreshing[p.id] ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 opacity-0 hover:opacity-100" />
                  )}
                </button>
              </div>
              {models.map((m) => (
                <ModelRowItem
                  key={`${p.id}:${m.modelId}`}
                  modelId={m.modelId}
                  label={m.label || m.modelId}
                  selected={providerId === p.id && modelId === m.modelId}
                  isDefault={m.isDefault}
                  starred={m.starred}
                  onSelect={() => {
                    onSelect(p.id, m.modelId);
                    setQuery("");
                    setOpen(false);
                  }}
                  onToggleStar={(e) => handleToggleStar(e, m.id)}
                  onSetDefault={(e) => handleSetDefault(e, p.id, m.modelId)}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="border-t p-2">
          <CustomModelInput
            providerId={provider?.id ?? providers[0]?.id}
            onPick={(pid, mid) => {
              onSelect(pid, mid);
              setQuery("");
              setOpen(false);
            }}
          />
        </div>

        <div className="flex items-center justify-between border-t px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setOpen(false);
              onOpenProviders();
            }}
          >
            <Settings2 className="h-3.5 w-3.5" /> Manage providers
          </Button>
          <button
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={anyRefreshing || providers.length === 0}
            onClick={() => {
              providers.forEach((p) => refreshModels(p.id));
            }}
          >
            Refresh all
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A single model row inside the dropdown. */
function ModelRowItem({
  modelId: _modelId,
  label,
  selected,
  isDefault,
  starred,
  onSelect,
  onToggleStar,
  onSetDefault,
}: {
  modelId: string;
  label: string;
  selected: boolean;
  isDefault: boolean;
  starred: boolean;
  onSelect: () => void;
  onToggleStar: (e: React.MouseEvent) => void;
  onSetDefault: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
        selected && "bg-accent"
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-2"
        onClick={onSelect}
      >
        {isDefault && (
          <span
            className="shrink-0 text-[10px] font-medium uppercase text-primary"
            title="Default model"
          >
            default
          </span>
        )}
        <span className="truncate">{label}</span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={onSetDefault}
          title={isDefault ? "Unset as default" : "Set as default model"}
        >
          <Pin
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              isDefault && "text-primary",
              isDefault && "-rotate-45"
            )}
          />
        </button>
        <button
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={onToggleStar}
          title={starred ? "Unstar" : "Star"}
        >
          <Star
            className={cn(
              "h-3.5 w-3.5",
              starred && "fill-amber-400 text-amber-400"
            )}
          />
        </button>
      </div>
    </div>
  );
}

function CustomModelInput({
  providerId,
  onPick,
}: {
  providerId?: string;
  onPick: (providerId: string, modelId: string) => void;
}) {
  const providers = useProvidersStore((s) => s.providers);
  const [value, setValue] = useState("");

  return (
    <div className="flex items-center gap-1.5">
      <select
        className="h-8 max-w-[40%] rounded-md border border-input bg-transparent px-1.5 text-xs outline-none"
        value={providerId ?? ""}
        onChange={() => {}}
        disabled
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
        placeholder="custom model id…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim() && providerId) {
            onPick(providerId, value.trim());
            setValue("");
          }
        }}
      />
    </div>
  );
}
