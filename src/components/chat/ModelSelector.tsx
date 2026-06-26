import { useMemo, useState } from "react";
import { ChevronsUpDown, Loader2, Search, Settings2 } from "lucide-react";

import { useProvidersStore } from "@/stores/providersStore";
import { useChatsStore } from "@/stores/chatsStore";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function ModelSelector({
  onOpenProviders,
}: {
  onOpenProviders: () => void;
}) {
  const providers = useProvidersStore((s) => s.providers);
  const modelsByProvider = useProvidersStore((s) => s.modelsByProvider);
  const refreshing = useProvidersStore((s) => s.refreshing);
  const refreshModels = useProvidersStore((s) => s.refreshModels);
  const getProvider = useProvidersStore((s) => s.getProvider);

  const chats = useChatsStore((s) => s.chats);
  const currentChatId = useChatsStore((s) => s.currentChatId);
  const setChatModel = useChatsStore((s) => s.setChatModel);

  const chat = chats.find((c) => c.id === currentChatId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const provider = chat ? getProvider(chat.providerId) : undefined;
  const anyRefreshing = Object.values(refreshing).some(Boolean);

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

  const triggerLabel = chat?.modelId
    ? chat.modelId
    : "Select a model";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 max-w-[280px] justify-between gap-2 px-3 text-xs"
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
            groups.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No models found. Refresh a provider to fetch models, or type a
                custom model id below.
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
              {models.map((m) => {
                const selected =
                  chat?.providerId === p.id && chat?.modelId === m.modelId;
                return (
                  <button
                    key={`${p.id}:${m.modelId}`}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                      selected && "bg-accent"
                    )}
                    onClick={() => {
                      if (chat) {
                        setChatModel(chat.id, p.id, m.modelId);
                      }
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{m.label || m.modelId}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="border-t p-2">
          <CustomModelInput
            providerId={provider?.id ?? providers[0]?.id}
            onPick={(providerId, modelId) => {
              if (chat) setChatModel(chat.id, providerId, modelId);
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
