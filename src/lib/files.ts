import {
  readTextFile,
  writeTextFile,
  readDir,
  exists,
  remove,
  type DirEntry as TauriDirEntry,
} from "@tauri-apps/plugin-fs";

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

/** Normalize a path for comparison: forward slashes, trimmed, no trailing
 *  slash, AND lexically resolve `.` and `..` segments so that path-traversal
 *  attempts cannot defeat the prefix containment check. */
function normalize(p: string): string {
  let s = (p ?? "").replace(/\\/g, "/");
  s = s.replace(/\/+/g, "/");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);

  // Split on '/'. Preserve a leading drive/root marker so canonicalization
  // keeps absolute paths absolute. Resolve '.' and '..' lexically.
  const isAbs = s.startsWith("/");
  const driveMatch = /^([A-Za-z]:)(\/.*)?$/.exec(s);
  let prefix = "";
  let body = s;
  if (driveMatch) {
    prefix = driveMatch[1];
    body = driveMatch[2] ?? "/";
  } else if (isAbs) {
    prefix = "/";
    body = s;
  }
  const segs = body.split("/").filter((seg) => seg !== "");
  const out: string[] = [];
  for (const seg of segs) {
    if (seg === ".") continue;
    if (seg === "..") {
      // Pop a real segment if one exists; '..' at the root is dropped so we
      // never escape above an absolute root via traversal.
      if (out.length > 0 && out[out.length - 1] !== "..") {
        out.pop();
      }
      continue;
    }
    out.push(seg);
  }
  let canon: string;
  if (prefix === "/") {
    canon = "/" + out.join("/");
  } else if (prefix) {
    canon = prefix + "/" + out.join("/");
  } else {
    canon = out.join("/");
  }
  return canon;
}

/** Join a root and a sub path with a single separating slash. */
function join(root: string, sub: string): string {
  const r = normalize(root);
  const s = normalize(sub).replace(/^\/+/, "");
  if (s === "") return r;
  return `${r}/${s}`;
}

/**
 * Resolve a possibly-relative path against the given absolute roots, and
 * guarantee the result lives strictly inside one of the roots. Returns the
 * absolute path, or throws Error if the path escapes all roots. If `subPath`
 * is already absolute and inside a root, it's used directly.
 */
export function resolveWithinRoots(subPath: string, roots: string[]): string {
  if (roots.length === 0) {
    throw new Error("resolveWithinRoots: no roots provided");
  }
  const sub = subPath ?? "";
  const isAbsolute =
    /^([A-Za-z]:[\\/]|[\\/]|([A-Za-z]:))/.test(sub) && sub.length > 0 &&
    (sub.startsWith("/") || sub.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(sub));

  // Try the path as-is (absolute) against each root first.
  if (isAbsolute) {
    const normSub = normalize(sub);
    for (const root of roots) {
      const r = normalize(root);
      if (normSub === r || normSub.startsWith(`${r}/`)) {
        return normSub;
      }
    }
  }

  // Otherwise join against each root; the first root that contains the
  // resolved path wins. (The spec calls for joining with the first root; we
  // still verify containment.)
  const primary = roots[0];
  const resolved = normalize(join(primary, sub));
  if (!isWithinRoots(resolved, roots)) {
    throw new Error(
      `resolveWithinRoots: path "${subPath}" escapes all permitted roots`
    );
  }
  return resolved;
}

/** True if `absPath` is strictly inside one of `roots`. */
export function isWithinRoots(absPath: string, roots: string[]): boolean {
  const p = normalize(absPath);
  for (const root of roots) {
    const r = normalize(root);
    if (p === r || p.startsWith(`${r}/`)) return true;
  }
  return false;
}

/** A path-safe bundle of file tools scoped to `roots`. */
export interface FileTools {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
  listDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  removeFile(path: string): Promise<void>;
  /** Read file, replace the first occurrence of `oldText` with `newText`
   *  (exact unique match), and write it back. Throw if oldText not found or
   *  not unique. */
  editFile(path: string, oldText: string, newText: string): Promise<void>;
}

/** A path-safe bundle of file tools scoped to `roots`. Every method resolves
 *  via resolveWithinRoots and rejects escapes. */
export function createFileTools(roots: string[]): FileTools {
  const resolve = (p: string) => resolveWithinRoots(p, roots);
  return {
    async readTextFile(path: string): Promise<string> {
      return readTextFile(resolve(path));
    },

    async writeTextFile(path: string, contents: string): Promise<void> {
      await writeTextFile(resolve(path), contents);
    },

    async listDir(path: string): Promise<DirEntry[]> {
      const resolved = resolve(path);
      const entries = await readDir(resolved);
      return entries.map((e: TauriDirEntry) => ({
        name: e.name,
        path: join(resolved, e.name),
        isDir: e.isDirectory,
      }));
    },

    async exists(path: string): Promise<boolean> {
      return exists(resolve(path));
    },

    async removeFile(path: string): Promise<void> {
      await remove(resolve(path));
    },

    async editFile(path: string, oldText: string, newText: string): Promise<void> {
      const resolved = resolve(path);
      const content = await readTextFile(resolved);
      const occurrences = content.split(oldText).length - 1;
      if (occurrences === 0) {
        throw new Error(
          `editFile: oldText not found in "${path}"`
        );
      }
      if (occurrences > 1) {
        throw new Error(
          `editFile: oldText is not unique in "${path}" (${occurrences} matches)`
        );
      }
      const updated = content.replace(oldText, newText);
      await writeTextFile(resolved, updated);
    },
  };
}

/** Maximum number of lines returned per page by `readFilePaged`. */
const MAX_QUERY_LINES = 2000;

export interface ReadFilePage {
  /** The text for this page (lines joined with \n). */
  text: string;
  totalLines: number;
  /** 1-indexed line this page starts at. */
  offset: number;
  limit: number;
  /** True if more lines remain (call again with offset = offset + limit). */
  hasMore: boolean;
}

/** Read a file in pages of lines so agents can page through arbitrarily
 *  large files instead of being truncated. `offset` is 1-indexed; `limit` is
 *  clamped to MAX_QUERY_LINES. */
export async function readFilePaged(
  files: FileTools,
  path: string,
  offset = 1,
  limit = MAX_QUERY_LINES
): Promise<ReadFilePage> {
  const lim = Math.max(1, Math.min(limit, MAX_QUERY_LINES));
  const off = Math.max(1, Math.floor(offset));
  const raw = await files.readTextFile(path);
  const lines = raw.split("\n");
  const totalLines = lines.length;
  const start = off - 1;
  const slice = lines.slice(start, start + lim);
  const hasMore = start + lim < totalLines;
  return {
    text: slice.join("\n"),
    totalLines,
    offset: off,
    limit: lim,
    hasMore,
  };
}

/** Format a paged read as the string an agent sees, appending a clear
 *  continuation hint when more lines remain. */
export function formatReadFilePage(page: ReadFilePage): string {
  const end = page.offset + page.text.split("\n").length - 1;
  const trailer = page.hasMore
    ? `\n\n…[showing lines ${page.offset}–${end} of ${page.totalLines}; call read_file again with offset=${page.offset + page.limit} to read the rest]`
    : page.totalLines > 0
      ? `\n\n[showing lines ${page.offset}–${end} of ${page.totalLines}]`
      : "";
  return page.text + trailer;
}
