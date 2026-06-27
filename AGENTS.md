# PowerUI

Desktop chat app for OpenAI-compatible model providers. Power-user oriented,
open-source. Tauri 2.0 + React 19 + Vite 7 + TypeScript 5.8, Tailwind v4 +
shadcn/ui (new-york), SQLite via `tauri-plugin-sql`, zustand 5 state.

Monorepo: `src/` is the webview frontend, `src-tauri/` is the Rust core.

## Commands

- `npm run tauri dev` — run the full app (Vite + Rust). First build compiles
  ~460 crates; subsequent rebuilds are incremental.
- `npm run dev` — frontend only on http://localhost:1420 (no native APIs).
- `npm run build` — `tsc --noEmit` typecheck, then Vite production bundle.
- `npx tsc --noEmit` — fast typecheck without bundling. Run after frontend
  edits.
- `cargo check` (in `src-tauri/`) — typecheck Rust without linking.
- `npm run tauri build` — production installer under
  `src-tauri/target/release/bundle/`.
  (The library crate name is `powerui_lib`; renaming it touches
  `Cargo.toml` `[lib] name` and the `powerui_lib::run()` call in
  `src-tauri/src/main.rs` — keep them in sync.)

## Architecture

```
src/
  components/
    ui/          shadcn/ui primitives (new-york). Copy-paste, owned by us.
    chat/        Sidebar, ChatView, ModelSelector, MessageBubble
    provider/    ProviderSettingsDialog
  stores/        zustand stores: chatsStore (streaming), providersStore
  lib/
    db.ts        typed SQLite wrapper over tauri-plugin-sql (all CRUD)
    api/openai.ts  OpenAI-compatible client: GET /v1/models + SSE streaming
    utils.ts     cn() class merge
  types/index.ts shared domain types
src-tauri/
  src/lib.rs     plugin + migration registration
  migrations/001_init.sql   schema (providers, models, chats, messages)
  capabilities/default.json  Tauri permissions
```

## Code style

- Frontend uses `@/` alias (`@/components`, `@/lib`, `@/stores`, `@/types`).
  Configure in `tsconfig.json` paths + `vite.config.ts` resolve.alias.
- TypeScript `strict` + `noUnusedLocals`/`noUnusedParameters` are on. Remove
  unused imports or the typecheck fails.
- shadcn/ui components in `src/components/ui/` are vendored — edit them
  directly. Add new ones via `npx shadcn@latest add <name>`.
- All DB access goes through `src/lib/db.ts`. Do not call
  `@tauri-apps/plugin-sql` directly from stores/components — add a function
  in `db.ts` and use it.
- All provider API calls go through `src/lib/api/openai.ts`. It handles
  base-URL normalization (`/v1` appending) and SSE parsing; do not bypass.
- State lives in zustand stores, not React context. Stores are the single
  source of truth for providers/chats/messages.

## Tauri gotchas (important)

These are project-specific traps we've already hit. Respect them.

- **SQLite driver must be enabled by cargo feature.** `Cargo.toml` must
  declare `tauri-plugin-sql = { version = "2", features = ["sqlite"] }`.
  Without the `sqlite` feature, every DB call fails at runtime with
  "No database driver enabled!". (`tauri add sql` does not add the feature
  for you.)
- **Write commands need explicit capabilities.** `sql:default` only grants
  `load` + `select`. Any `execute` (INSERT/UPDATE/DELETE) requires
  `sql:allow-execute` in `src-tauri/capabilities/default.json`.
- **HTTP scope is intentionally wide** (`http://**`, `https://**` in
  capabilities). Users configure arbitrary providers, so do not restrict it.
- **Migrations are registered in Rust** (`src-tauri/src/lib.rs`), not picked
  up automatically. After adding a migration file, add a `Migration` entry
  with `include_str!`.
- **New Rust plugin? Set its capability too.** `tauri add <plugin>` adds the
  dependency but you must grant permissions in
  `src-tauri/capabilities/default.json`.

## Conventions

- Provider base URLs may or may not include `/v1`. `joinModelsPath` /
  `joinChatPath` in `api/openai.ts` handle this; never hard-append `/v1/...`
  elsewhere.
- Chats auto-title from the first user message (see `deriveTitle` in
  `chatsStore.ts`). Don't set a fixed title on creation.
- Assistant messages are created as an empty placeholder, streamed into
  live, then persisted in full at the end (or on stop). Order:
  insert user msg → insert assistant placeholder → stream → persist final.
- Dark mode is the default (`<html class="dark">` + `.dark` CSS vars in
  `src/index.css`). Design tokens are OKLCH; keep new colors on the same
  scale.
- `package.json` scripts listed there are the canonical commands. Use them
  rather than invoking `vite`/`cargo` ad hoc.

## Git workflow

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Keep commits focused; prefer squash-merge on PRs.

## Boundaries

- Do not add business logic to `src/components/ui/` — those are primitives.
- Do not bypass the DB wrapper (`lib/db.ts`) or API client
  (`lib/api/openai.ts`).
- Do not commit `src-tauri/target/` or `dist/` (gitignored).
- API keys are stored locally in SQLite (`providers.api_key`). Never log
  them or echo them into the UI; `ProviderSettingsDialog` uses a
  password-type input — keep it that way.

## Roadmap context

Planned near-term: system prompts + temperature/max-tokens, message
regeneration/edit, model metadata (context length). Later: coding-agent
mode, likely via PI agents reusing the provider/model abstraction already
in `lib/api/openai.ts` + `providersStore`. When adding agent features,
keep them behind the existing provider configuration flow rather than a
separate one.

## Agent workspace (implemented)

Every chat is an **agent workspace**. The chat assistant is a **manager**
that can create tasks, assign them to per-chat **sub-agents**, and react to
sub-agent events. Sub-agents run in the background and operate on the
chat's **folders** (working directories). All capabilities are available in
every chat (no opt-in mode).

### Data model (migration `002_agents.sql`)
`chat_folders`, `tasks`, `sub_agents`, `agent_runs`, `agent_events`. CRUD
lives in `lib/db.ts`. `agent_runs` allows multiple concurrent rows per
`sub_agent_id` (one per assigned task). `agent_events` carry the
sub-agent↔manager message/question/answer/task_complete traffic; rows with
`pending=1` are blocking questions awaiting an answer.

### Runtime (`src/lib/agent/`)
- `types.ts` — `runAgentLoop(opts)`: an OpenAI-compatible tool-calling loop
  (non-streaming `chatCompletion` from `lib/api/openai.ts`). Supports
  `initialMessages` (full history), a `mailbox()` hook drained each turn so a
  caller can inject messages into a *running* loop, and stops on the
  `complete_task` tool / maxTurns / abort.
- `subAgentTools.ts` — `buildSubAgentTools({chatId,runId,taskId,roots})`:
  `read_file`/`list_files`/`write_file`/`edit_file`/`delete_file` (path-safe
  via `lib/files.ts` `createFileTools`, which rejects `..` escapes), plus
  `send_message_to_manager` (non-blocking), `ask_manager` (blocking — awaits
  a `agentBus.deliverAnswer`), and `complete_task`.
- `managerTools.ts` — `buildManagerTools(chatId)`: `create_task`, `list_tasks`,
  `assign_task` (launches a sub-agent run), `update_task`, `list_sub_agents`,
  `list_folders`, `answer_question`.
- `bus.ts` — in-memory `agentBus` singleton (per-chat pub/sub + pending
  question resolvers). No zustand imports.

### Stores
- `chatFoldersStore`, `tasksStore`, `subAgentsStore`, `agentActivityStore`,
  `managerStore` — each auto-loads on `chatsStore.currentChatId` change via a
  module-scope subscription.
- `agentActivityStore.launchSubAgent` creates an `agent_run`, marks the task
  `in_progress`, runs `runAgentLoop` **detached** (returns immediately), and
  on completion sets the task `done` + emits a `task_complete` event.
  `answerQuestion(eventId, answer)` persists the answer and resolves the
  blocking `ask_manager` promise via `agentBus.deliverAnswer`.
- `managerStore` is the chat assistant. `send(text)` persists the user
  message then runs a manager turn; if a turn is already active it injects
  into the running loop's mailbox instead of starting a new one. It
  subscribes to `agentBus`: a `sub_to_manager` event starts a manager turn
  when idle, or is injected when active. Manager replies stream into the
  chat as assistant messages.

### UI
`WorkspacePanel` (right sidebar, collapsible) hosts tabs: `FoldersPanel`,
`TasksPanel`, `SubAgentsPanel` (+`SubAgentEditor`), `ActivityPanel`. The
activity panel lists pending questions (answer inline), active runs
(cancel), an event log, and a manual sub-agent launch control. `ChatView`
sends via `useManagerStore.send` and uses `managerStore.running`/`stop`
for the send/stop button.

### Gotchas
- The manager and sub-agents use **non-streaming** completions (tool calling).
  Manager text appears per assistant step, not token-by-token.
- `ask_manager` blocking has a theoretical (practically impossible) race if
  the manager answered before the sub-agent registered its resolver; the
  manager always performs a model round-trip first, so this never happens in
  practice.
- `lib/files.ts` canonicalizes `.`/`..` lexically; never bypass
  `createFileTools`/`resolveWithinRoots` when touching user folders.
- `chatsStore.sendMessage`/`isStreaming`/`stopStreaming` are the legacy
  non-agent streaming path, retained but no longer wired to the UI.
