import { useState } from "react";
import { Loader2 } from "lucide-react";

import { useSubAgentsStore } from "@/stores/subAgentsStore";
import { useProvidersStore } from "@/stores/providersStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SubAgent } from "@/types";

/** Sentinel value representing "use the chat's model" (no explicit override). */
const INHERIT = "__inherit__";

export function SubAgentEditor({
  open,
  onOpenChange,
  chatId,
  subAgent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  subAgent?: SubAgent | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/* The form lives inside DialogContent so its local state resets each
            time the dialog is opened (Radix mounts/unmounts the content). */}
        <SubAgentForm
          chatId={chatId}
          subAgent={subAgent ?? null}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function SubAgentForm({
  chatId,
  subAgent,
  onDone,
}: {
  chatId: string;
  subAgent: SubAgent | null;
  onDone: () => void;
}) {
  const addSubAgent = useSubAgentsStore((s) => s.addSubAgent);
  const editSubAgent = useSubAgentsStore((s) => s.editSubAgent);

  const providers = useProvidersStore((s) => s.providers);
  const modelsByProvider = useProvidersStore((s) => s.modelsByProvider);

  const [name, setName] = useState(subAgent?.name ?? "");
  const [description, setDescription] = useState(subAgent?.description ?? "");
  const [providerSel, setProviderSel] = useState(
    subAgent?.providerId ?? INHERIT
  );
  const [modelSel, setModelSel] = useState(subAgent?.modelId ?? INHERIT);
  const [systemPrompt, setSystemPrompt] = useState(
    subAgent?.systemPrompt ?? ""
  );
  const [saving, setSaving] = useState(false);

  const models =
    providerSel === INHERIT ? [] : modelsByProvider[providerSel] ?? [];

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const providerId = providerSel === INHERIT ? null : providerSel;
      const modelId = modelSel === INHERIT ? null : modelSel;
      if (subAgent) {
        await editSubAgent(subAgent.id, {
          name: trimmed,
          description: description.trim(),
          providerId,
          modelId,
          systemPrompt,
        });
      } else {
        await addSubAgent({
          chatId,
          name: trimmed,
          description: description.trim(),
          providerId,
          modelId,
          systemPrompt,
        });
      }
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {subAgent ? "Edit sub-agent" : "New sub-agent"}
        </DialogTitle>
        <DialogDescription>
          Define a sub-agent scoped to this chat. Leave the model unset to
          inherit the chat&apos;s provider and model.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subagent-name">Name</Label>
          <Input
            id="subagent-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Code reviewer"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subagent-desc">Description</Label>
          <Textarea
            id="subagent-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this sub-agent do?"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <Select
              value={providerSel}
              onValueChange={(v) => {
                setProviderSel(v);
                // Reset model selection when the provider changes so we never
                // show a model id from a different provider.
                setModelSel(INHERIT);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Use chat's model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INHERIT}>Use chat&apos;s model</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Model</Label>
            <Select
              value={modelSel}
              onValueChange={setModelSel}
              disabled={providerSel === INHERIT}
            >
              <SelectTrigger>
                <SelectValue placeholder="Use chat's model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INHERIT}>Use chat&apos;s model</SelectItem>
                {models.map((m) => (
                  <SelectItem key={m.modelId} value={m.modelId}>
                    {m.label || m.modelId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subagent-prompt">System prompt</Label>
          <Textarea
            id="subagent-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Optional system instructions for this sub-agent…"
            rows={5}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!name.trim() || saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {subAgent ? "Save changes" : "Create sub-agent"}
        </Button>
      </DialogFooter>
    </>
  );
}
