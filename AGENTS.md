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
