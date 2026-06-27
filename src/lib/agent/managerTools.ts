import type { Tool } from "@/lib/agent/types";
import { createFileTools, formatReadFilePage, readFilePaged } from "@/lib/files";
import { useTasksStore } from "@/stores/tasksStore";
import { useSubAgentsStore } from "@/stores/subAgentsStore";
import { useChatFoldersStore } from "@/stores/chatFoldersStore";
import { useAgentActivityStore } from "@/stores/agentActivityStore";

function strArg(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Return a fresh, read-only FileTools bundle scoped to the chat's current
 *  folder roots. Returns null when no folders are configured. */
function readOnlyFileTools() {
  const roots = useChatFoldersStore.getState().folders.map((f) => f.path);
  if (roots.length === 0) return null;
  return createFileTools(roots);
}

/** Build the set of tools the chat manager may use during a turn. Each tool
 *  reads fresh state from the stores via `useXStore.getState()` so it sees
 *  live data even mid-loop. Results are plain-text strings. */
export function buildManagerTools(chatId: string): Tool[] {
  const create_task: Tool = {
    name: "create_task",
    description:
      "Create a new task in this chat. Returns 'created task <id>: <title>'.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["title"],
    },
    async execute(args) {
      const title = strArg(args, "title");
      const description = strArg(args, "description");
      if (!title) return "Error: title is required";
      try {
        const task = await useTasksStore
          .getState()
          .addTask({ chatId, title, description, createdBy: "manager" });
        if (!task) return "Error: could not create task";
        return `created task ${task.id}: ${task.title}`;
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const list_tasks: Tool = {
    name: "list_tasks",
    description:
      "List all tasks in this chat with their status and assignee. Each line: '- [<status>] <title> (id=<id>, assignee=<name or none>)'.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const { tasks } = useTasksStore.getState();
      const { subAgents } = useSubAgentsStore.getState();
      const mine = tasks.filter((t) => t.chatId === chatId);
      if (mine.length === 0) return "(no tasks)";
      const lines = mine.map((t) => {
        const assignee = t.assigneeId
          ? subAgents.find((a) => a.id === t.assigneeId)?.name ?? "unknown"
          : "none";
        return `- [${t.status}] ${t.title} (id=${t.id}, assignee=${assignee})`;
      });
      return lines.join("\n");
    },
  };

  const assign_task: Tool = {
    name: "assign_task",
    description:
      "Assign a task to a sub-agent and launch it in the background. Returns the run id or a failure message.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        sub_agent_id: { type: "string" },
      },
      required: ["task_id", "sub_agent_id"],
    },
    async execute(args) {
      const taskId = strArg(args, "task_id");
      const subAgentId = strArg(args, "sub_agent_id");
      const task = useTasksStore.getState().tasks.find((t) => t.id === taskId);
      if (!task) return `Error: no task with id ${taskId}`;
      const subAgent = useSubAgentsStore
        .getState()
        .subAgents.find((a) => a.id === subAgentId);
      if (!subAgent) return `Error: no sub-agent with id ${subAgentId}`;
      const runId = await useAgentActivityStore
        .getState()
        .launchSubAgent(chatId, subAgentId, taskId);
      if (!runId) return "failed to launch sub-agent (no provider/model configured)";
      return `launched sub-agent '${subAgent.name}' on task '${task.title}' (run ${runId})`;
    },
  };

  const update_task: Tool = {
    name: "update_task",
    description:
      "Update a task's status. status must be one of todo, in_progress, done, cancelled.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "done", "cancelled"],
        },
      },
      required: ["task_id", "status"],
    },
    async execute(args) {
      const taskId = strArg(args, "task_id");
      const status = strArg(args, "status") as
        | "todo"
        | "in_progress"
        | "done"
        | "cancelled";
      const task = useTasksStore.getState().tasks.find((t) => t.id === taskId);
      if (!task) return `Error: no task with id ${taskId}`;
      await useTasksStore.getState().setStatus(taskId, status);
      return `task ${taskId} set to ${status}`;
    },
  };

  const list_sub_agents: Tool = {
    name: "list_sub_agents",
    description:
      "List the sub-agents available in this chat with their model configuration.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const { subAgents } = useSubAgentsStore.getState();
      if (subAgents.length === 0) return "(no sub-agents)";
      const lines = subAgents.map((a) => {
        let model: string;
        if (!a.providerId && !a.modelId) {
          model = "inherits chat";
        } else {
          const resolved = useSubAgentsStore.getState().resolveModel(a.id);
          model = resolved
            ? `${resolved.providerName}/${resolved.modelId}`
            : "inherits chat";
        }
        return `- ${a.name} (id=${a.id}): ${a.description} [model: ${model}]`;
      });
      return lines.join("\n");
    },
  };

  const create_sub_agent: Tool = {
    name: "create_sub_agent",
    description:
      "Create a new sub-agent definition scoped to this chat. Provide a name, a short description of what it does, and a system_prompt with its full instructions. provider_id/model_id are optional (omit to inherit the chat's model). Returns 'created sub-agent <id>: <name>'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        system_prompt: { type: "string" },
        provider_id: { type: "string" },
        model_id: { type: "string" },
      },
      required: ["name", "description", "system_prompt"],
    },
    async execute(args) {
      const name = strArg(args, "name").trim();
      if (!name) return "Error: name is required";
      const description = strArg(args, "description");
      const systemPrompt = strArg(args, "system_prompt");
      const providerId = strArg(args, "provider_id");
      const modelId = strArg(args, "model_id");
      try {
        const sa = await useSubAgentsStore.getState().addSubAgent({
          chatId,
          name,
          description,
          systemPrompt,
          providerId: providerId || null,
          modelId: modelId || null,
        });
        if (!sa) return "Error: could not create sub-agent";
        return `created sub-agent ${sa.id}: ${sa.name}`;
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const update_sub_agent: Tool = {
    name: "update_sub_agent",
    description:
      "Update an existing sub-agent definition. Pass sub_agent_id and any of name, description, system_prompt, provider_id, model_id to overwrite. To make the sub-agent inherit the chat's model, set provider_id and model_id to '__inherit__'. Only provided fields are changed.",
    parameters: {
      type: "object",
      properties: {
        sub_agent_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        system_prompt: { type: "string" },
        provider_id: { type: "string" },
        model_id: { type: "string" },
      },
      required: ["sub_agent_id"],
    },
    async execute(args) {
      const subAgentId = strArg(args, "sub_agent_id");
      const sa = useSubAgentsStore
        .getState()
        .subAgents.find((a) => a.id === subAgentId);
      if (!sa) return `Error: no sub-agent with id ${subAgentId}`;
      const patch: {
        name?: string;
        description?: string;
        systemPrompt?: string;
        providerId?: string | null;
        modelId?: string | null;
      } = {};
      if (args.name !== undefined) patch.name = strArg(args, "name");
      if (args.description !== undefined)
        patch.description = strArg(args, "description");
      if (args.system_prompt !== undefined)
        patch.systemPrompt = strArg(args, "system_prompt");
      if (args.provider_id !== undefined) {
        const v = strArg(args, "provider_id");
        patch.providerId = v === "__inherit__" || v === "" ? null : v;
      }
      if (args.model_id !== undefined) {
        const v = strArg(args, "model_id");
        patch.modelId = v === "__inherit__" || v === "" ? null : v;
      }
      if (Object.keys(patch).length === 0)
        return "no fields to update";
      try {
        await useSubAgentsStore.getState().editSubAgent(subAgentId, patch);
        return `updated sub-agent ${subAgentId} (${sa.name})`;
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const list_folders: Tool = {
    name: "list_folders",
    description: "List the workspace folder roots configured for this chat.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const roots = useChatFoldersStore
        .getState()
        .folders.map((f) => f.path);
      if (roots.length === 0) return "(none)";
      return roots.join("\n");
    },
  };

  const read_file: Tool = {
    name: "read_file",
    description:
      "Read the text contents of a file within one of the chat's workspace folders (read-only). Path may be relative to a root or absolute within one. Returns up to 2000 lines at a time; for large files, a trailing note tells you how many lines remain and what offset to pass next. Use offset (1-indexed line) and limit (max 2000 lines) to page through the full file.",
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
      if (!path) return "Error: path is required";
      const files = readOnlyFileTools();
      if (!files)
        return "Error: no workspace folders configured for this chat";
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
      "List entries in a directory within one of the chat's workspace folders (read-only). Returns lines of 'name (dir|file)'.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    async execute(args) {
      const path = strArg(args, "path");
      if (!path) return "Error: path is required";
      const files = readOnlyFileTools();
      if (!files)
        return "Error: no workspace folders configured for this chat";
      try {
        const entries = await files.listDir(path);
        const lines = entries.map((e) =>
          `${e.name} (${e.isDir ? "dir" : "file"})`
        );
        const joined = lines.join("\n");
        const MAX = 8000;
        return joined.length <= MAX
          ? joined
          : joined.slice(0, MAX) + "\n…[truncated]";
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const answer_question: Tool = {
    name: "answer_question",
    description:
      "Answer a pending question from a sub-agent, identified by its question_event_id. Returns 'answered'.",
    parameters: {
      type: "object",
      properties: {
        question_event_id: { type: "string" },
        answer: { type: "string" },
      },
      required: ["question_event_id", "answer"],
    },
    async execute(args) {
      const eventId = strArg(args, "question_event_id");
      const answer = strArg(args, "answer");
      const pending = useAgentActivityStore
        .getState()
        .events.find(
          (e) => e.id === eventId && e.kind === "question" && e.pending
        );
      if (!pending) return `Error: no pending question with id ${eventId}`;
      await useAgentActivityStore.getState().answerQuestion(eventId, answer);
      return "answered";
    },
  };

  return [
    create_task,
    list_tasks,
    assign_task,
    update_task,
    create_sub_agent,
    update_sub_agent,
    list_sub_agents,
    list_folders,
    read_file,
    list_files,
    answer_question,
  ];
}
