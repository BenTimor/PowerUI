# PowerUI

A power-user desktop chat app for open-source and OpenAI-compatible models.
Think "Codex Desktop / ChatGPT Desktop, but for any provider you bring."

PowerUI is built with **Tauri 2.0** (Rust + system webview), **React + Vite +
TypeScript**, **Tailwind v4 + shadcn/ui**, and **SQLite** for local
persistence. It talks to any endpoint that implements the OpenAI-compatible
API (`/v1/models` + `/v1/chat/completions`) — Ollama, LM Studio, OpenRouter,
Groq, vLLM, OpenAI, and more.

## Features

- **Chats** — create, rename, delete chats from a left sidebar. Titles
  auto-derive from your first message.
- **Per-chat provider + model** — pick a provider and model for each chat
  from a searchable popover; supports cached model dropdowns and free-text
  custom model ids.
- **Providers** — configure any number of OpenAI-compatible providers
  (name, base URL, API key). Models are fetched automatically and cached.
- **Streaming** — responses stream token-by-token with markdown rendering
  (code blocks, lists, tables via GFM). Stop button to abort mid-stream.
- **Dark-first UI** — clean, keyboard-friendly, no telemetry.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Tauri 2 system dependencies — see the
  [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Run in development

```bash
cd powerui
npm install
npm run tauri dev
```

### Build a production binary

```bash
npm run tauri build
```

The installer / executable appears under `src-tauri/target/release/bundle/`.

## Using it

1. Open **Providers & models** (bottom of the sidebar, or the model selector).
2. Add a provider. Some presets are pre-filled (Ollama, OpenRouter, Groq,
   OpenAI, LM Studio). Models are fetched on save. For a local Ollama
   install, just use `http://localhost:11434` with no API key.
3. Start a new chat. Pick a model from the selector in the top bar.
4. Type a message and press **Enter** (Shift+Enter for a newline).

## Project structure

```
powerui/
├── src/                          # Frontend (React + TS)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives
│   │   ├── chat/                 # Sidebar, ChatView, ModelSelector, MessageBubble
│   │   └── provider/             # ProviderSettingsDialog
│   ├── stores/                   # zustand stores (chats, providers)
│   ├── lib/
│   │   ├── db.ts                 # typed SQLite wrapper (tauri-plugin-sql)
│   │   ├── api/openai.ts         # OpenAI-compatible client (models + streaming)
│   │   └── utils.ts
│   ├── types/index.ts
│   ├── App.tsx
│   └── main.tsx
└── src-tauri/
    ├── migrations/001_init.sql   # DB schema
    ├── capabilities/default.json # Tauri permissions (http + sql scopes)
    └── src/lib.rs                 # Plugin + migration registration
```

## Tech notes

- **Storage** — SQLite via `tauri-plugin-sql`, with a migration registered in
  Rust (`src-tauri/src/lib.rs`). The DB file lives in the app data directory
  as `powerui.db`.
- **Networking** — HTTP goes through `tauri-plugin-http`'s `fetch`, which
  bypasses browser CORS and supports streaming `ReadableStream` bodies. The
  capability grants `http://**` and `https://**` so you can point at any host.
- **Streaming** — server-sent events from `/v1/chat/completions` are parsed
  incrementally; deltas update the assistant message live and are persisted
  at the end (and on stop).

## Roadmap

This is the initial slice. Planned next:

- System prompts & conversation parameters (temperature, max tokens)
- Model metadata (context length, pricing)
- Multi-message editing / regeneration
- Coding-agent mode (this is where PI agents may plug in)
- Export / import chats
- Light theme toggle

## License

MIT
