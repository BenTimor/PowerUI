import { createAgentEvent } from "@/lib/db";
import { createFileTools, formatReadFilePage, readFilePaged } from "@/lib/files";
import { agentBus } from "@/lib/agent/bus";
import type { Tool } from "@/lib/agent/types";
import { buildExaWebTools } from "@/lib/agent/webTools";

const MAX_LIST = 8000;

function strArg(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Build the set of tools a sub-agent may use during a run. Each tool
 *  persists relevant events to the db and emits them on the agent bus. */
export function buildSubAgentTools(opts: {
  chatId: string;
  runId: string;
  taskId: string;
  roots: string[];
}): Tool[] {
  const { chatId, runId, roots } = opts;
  const files = createFileTools(roots);

  async function persistEvent(input: {
    direction: Parameters<typeof createAgentEvent>[0]["direction"];
    kind: Parameters<typeof createAgentEvent>[0]["kind"];
    content: string;
    pending?: boolean;
  }): Promise<string> {
    const ev = await createAgentEvent({
      chatId,
      runId,
      direction: input.direction,
      kind: input.kind,
      content: input.content,
      pending: input.pending,
    });
    agentBus.emit(ev);
    return ev.id;
  }

  const read_file: Tool = {
    name: "read_file",
    description:
      "Read the text contents of a file at the given path (relative to a workspace root or absolute within one). Returns up to 2000 lines at a time; for large files, a trailing note tells you how many lines remain and what offset to pass next. Use offset (1-indexed line) and limit (max 2000 lines) to page through the full file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "number", description: "1-indexed line to start at (default 1)" },
        limit: { type: "number", description: "max lines to return (default 2000, capped at 2000)" },
      },
      required: ["path"],
    },
    async execute(args) {
      const path = strArg(args, "path");
      const offset =
        typeof args.offset === "number" ? args.offset : undefined;
      const limit =
        typeof args.limit === "number" ? args.limit : undefined;
      try {
        const page = await readFilePaged(files, path, offset, limit);
        return formatReadFilePage(page);
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const list_files: Tool = {
    name: "list_files",
    description:
      "List entries in a directory at the given path. Returns lines of 'name (dir|file)'.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    async execute(args) {
      const path = strArg(args, "path");
      const entries = await files.listDir(path);
      const lines = entries.map((e) =>
        `${e.name} (${e.isDir ? "dir" : "file"})`
      );
      const joined = lines.join("\n");
      return joined.length <= MAX_LIST
        ? joined
        : joined.slice(0, MAX_LIST) + "\n…[truncated]";
    },
  };

  const write_file: Tool = {
    name: "write_file",
    description: "Write text content to a file (creates or overwrites).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    async execute(args) {
      const path = strArg(args, "path");
      const content = strArg(args, "content");
      await files.writeTextFile(path, content);
      return `wrote ${path}`;
    },
  };

  const edit_file: Tool = {
    name: "edit_file",
    description:
      "Replace the first unique occurrence of old_text with new_text in a file. Throws if old_text is missing or not unique.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
      },
      required: ["path", "old_text", "new_text"],
    },
    async execute(args) {
      const path = strArg(args, "path");
      const oldText = strArg(args, "old_text");
      const newText = strArg(args, "new_text");
      try {
        await files.editFile(path, oldText, newText);
        return "edited";
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const delete_file: Tool = {
    name: "delete_file",
    description: "Delete a file at the given path.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    async execute(args) {
      const path = strArg(args, "path");
      await files.removeFile(path);
      return "deleted";
    },
  };

  const send_message_to_manager: Tool = {
    name: "send_message_to_manager",
    description:
      "Send a non-blocking progress message to the chat manager / user. Returns 'sent'.",
    parameters: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
    async execute(args) {
      const message = strArg(args, "message");
      await persistEvent({
        direction: "sub_to_manager",
        kind: "message",
        content: message,
      });
      return "sent";
    },
  };

  const ask_manager: Tool = {
    name: "ask_manager",
    description:
      "Ask the chat manager a blocking question. The run pauses until the manager answers, then returns the answer text.",
    parameters: {
      type: "object",
      properties: { question: { type: "string" } },
      required: ["question"],
    },
    async execute(args) {
      const question = strArg(args, "question");
      const pendingEventId = await persistEvent({
        direction: "sub_to_manager",
        kind: "question",
        content: question,
        pending: true,
      });
      const answer = await new Promise<string>((resolve) => {
        agentBus.registerPending(pendingEventId, resolve);
      });
      return answer;
    },
  };

  const complete_task: Tool = {
    name: "complete_task",
    description:
      "Signal that the task is finished. Provide a short summary of what was accomplished. The run stops after this is called.",
    parameters: {
      type: "object",
      properties: { summary: { type: "string" } },
    },
    async execute(args) {
      const summary = strArg(args, "summary");
      await persistEvent({
        direction: "sub_to_manager",
        kind: "task_complete",
        content: summary,
      });
      return summary || "task_completed";
    },
  };

  return [
    read_file,
    list_files,
    write_file,
    edit_file,
    delete_file,
    ...buildExaWebTools(),
    send_message_to_manager,
    ask_manager,
    complete_task,
  ];
}
