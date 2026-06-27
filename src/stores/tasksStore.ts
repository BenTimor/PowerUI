import { create } from "zustand";

import type { Task, TaskStatus } from "@/types";
import * as db from "@/lib/db";
import { useChatsStore } from "./chatsStore";

interface TasksState {
  tasks: Task[];
  loading: boolean;
  load: (chatId: string) => Promise<void>;
  clear: () => void;
  addTask: (input: {
    chatId: string;
    title: string;
    description?: string;
    createdBy?: "user" | "manager";
    assigneeId?: string | null;
  }) => Promise<Task | null>;
  editTask: (
    id: string,
    patch: Partial<
      Pick<Task, "title" | "description" | "status" | "assigneeId">
    >
  ) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  setStatus: (id: string, status: TaskStatus) => Promise<void>;
  assignTask: (id: string, assigneeId: string | null) => Promise<void>;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  loading: false,

  load: async (chatId) => {
    set({ loading: true });
    try {
      const tasks = await db.listTasks(chatId);
      set({ tasks });
    } finally {
      set({ loading: false });
    }
  },

  clear: () => {
    set({ tasks: [], loading: false });
  },

  addTask: async (input) => {
    if (!input.chatId) return null;
    const task = await db.createTask(input);
    set((s) => ({ tasks: [...s.tasks, task] }));
    return task;
  },

  editTask: async (id, patch) => {
    await db.updateTask(id, patch);
    const existing = get().tasks.find((t) => t.id === id);
    if (!existing) return;
    const updated: Task = {
      ...existing,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.assigneeId !== undefined
        ? { assigneeId: patch.assigneeId }
        : {}),
      updatedAt: Date.now(),
    };
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? updated : t)),
    }));
  },

  removeTask: async (id) => {
    await db.deleteTask(id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },

  setStatus: async (id, status) => {
    await get().editTask(id, { status });
  },

  assignTask: async (id, assigneeId) => {
    await get().editTask(id, { assigneeId });
  },
}));

/**
 * Auto-load tasks when the current chat changes. Set up once at import time.
 * When `currentChatId` becomes truthy, load its tasks; when null, clear.
 */
let prevChatId: string | null = useChatsStore.getState().currentChatId;
useChatsStore.subscribe((state) => {
  if (state.currentChatId === prevChatId) return;
  prevChatId = state.currentChatId;
  if (state.currentChatId) {
    void useTasksStore.getState().load(state.currentChatId);
  } else {
    useTasksStore.getState().clear();
  }
});

// Eagerly load if a chat is already selected at module import time.
{
  const id = useChatsStore.getState().currentChatId;
  if (id) void useTasksStore.getState().load(id);
}
