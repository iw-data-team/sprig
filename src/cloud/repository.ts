import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { MindElixirData } from "mind-elixir";
import { clean } from "../model";

export type Role = "owner" | "editor" | "viewer";
export type Doc = {
  id: string;
  data: MindElixirData;
  updated: number;
  ownerId?: string;
  role?: Role;
  version?: number;
};
export type Share = {
  id: string;
  invite_email: string;
  role: "viewer" | "editor";
  recipient_id: string | null;
};
type DraftDoc = Doc & { draftRevision?: string; recovery?: boolean };
type Row = {
  id: string;
  data: unknown;
  updated_at: string;
  owner_id: string;
  role: Role;
  version: number;
};
export class CloudError extends Error {
  code: string;
  constructor(message: string, code = "") {
    super(message);
    this.code = code;
  }
}
// Vite provides `env` in the browser build; Node-based tests load this module too.
const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const url = env?.VITE_SUPABASE_URL || "";
const key = env?.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const cloudConfigured = Boolean(url && key);
export const supabase = cloudConfigured
  ? createClient(url, key, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
export const siteUrl = () =>
  new URL(env?.BASE_URL || "/", globalThis.location?.origin || "http://localhost").href;
function decode(row: Row): Doc {
  return {
    id: row.id,
    data: clean(row.data),
    updated: Date.parse(row.updated_at),
    ownerId: row.owner_id,
    role: row.role,
    version: Number(row.version),
  };
}
export function errorMessage(error: unknown): string {
  if (error instanceof CloudError && error.code === "40001")
    return "Sơ đồ đã được người khác cập nhật. Bản nháp của bạn vẫn được giữ lại.";
  if (error instanceof CloudError && error.code === "42501")
    return "Bạn không còn quyền truy cập hoặc chỉnh sửa sơ đồ này. Bản nháp vẫn được giữ lại.";
  return error instanceof Error
    ? error.message
    : "Không kết nối được cloud. Hãy thử lại.";
}

export class CloudRepository {
  readonly user: User;
  private client: SupabaseClient;
  private versions = new Map<string, number>();
  private queue = new Map<string, Promise<Doc>>();
  private blocked = new Set<string>();
  readonly failures = new Map<string, Error>();
  private pending = new Set<string>();
  readonly draftKey: string;
  constructor(client: SupabaseClient, user: User) {
    this.client = client;
    this.user = user;
    this.draftKey = `sprig-drafts-v1:${user.id}`;
  }
  private async rpc<T>(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw new CloudError(error.message, error.code);
    return data as T;
  }
  private remember(row: Row): Doc {
    const doc = decode(row);
    this.versions.set(doc.id, doc.version!);
    return doc;
  }
  async list(): Promise<Doc[]> {
    const rows = await this.rpc<Row[]>("list_maps");
    return rows.map((row) => this.remember(row));
  }
  async get(id: string): Promise<Doc> {
    await this.queue.get(id)?.catch(() => {});
    const rows = await this.rpc<Row[]>("get_map", { p_id: id });
    if (!rows[0])
      throw new CloudError(
        "Sơ đồ không tồn tại hoặc chưa được chia sẻ với tài khoản Google này.",
        "42501",
      );
    this.preserveDrafts(id);
    const doc = this.remember(rows[0]);
    this.blocked.delete(id);
    this.failures.delete(id);
    this.queue.delete(id);
    return doc;
  }
  async claim(): Promise<void> {
    await this.rpc("claim_map_shares");
  }
  async create(data: MindElixirData, id: string = crypto.randomUUID()): Promise<Doc> {
    const rows = await this.rpc<Row[]>("create_map", {
      p_id: id,
      p_data: clean(data),
    });
    if (!rows[0]) throw Error("Không tạo được sơ đồ.");
    return this.remember(rows[0]);
  }
  stage(doc: Doc): string {
    const drafts = this.drafts();
    const revision = crypto.randomUUID();
    drafts[doc.id] = { ...doc, data: clean(doc.data), draftRevision: revision };
    // If storage is blocked, fail visibly before reporting that the draft is safe.
    localStorage.setItem(this.draftKey, JSON.stringify(drafts));
    return revision;
  }
  drafts(): Record<string, DraftDoc> {
    const raw = localStorage.getItem(this.draftKey);
    if (!raw) return {};
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error(
        "Không đọc được bản nháp trên máy. Hãy xuất JSON trước khi tiếp tục.",
      );
    return value;
  }
  // Move recovery snapshots away from live map IDs before opening cloud data.
  // Editing that map again must not replace an earlier unresolved local draft.
  preserveDrafts(id?: string) {
    const drafts = this.drafts();
    for (const [key, draft] of Object.entries(drafts)) {
      if ((id && key !== id) || draft.recovery) continue;
      const copyId = crypto.randomUUID();
      drafts[copyId] = { ...draft, id: copyId, recovery: true };
      delete drafts[key];
    }
    localStorage.setItem(this.draftKey, JSON.stringify(drafts));
  }
  clearDraft(id: string) {
    const drafts = this.drafts();
    delete drafts[id];
    localStorage.setItem(this.draftKey, JSON.stringify(drafts));
  }
  async save(input: Doc): Promise<Doc> {
    const doc = { ...input, data: clean(input.data) };
    const draftRevision = this.stage(doc);
    if (this.blocked.has(doc.id))
      return Promise.reject(
        this.failures.get(doc.id) ||
          Error("Hãy giải quyết xung đột trước khi lưu."),
      );
    const previous = this.queue.get(doc.id);
    this.pending.add(doc.id);
    const job = (previous ? previous.catch(() => undefined) : Promise.resolve())
      .then(async () => {
        if (this.blocked.has(doc.id))
          throw this.failures.get(doc.id) || Error("Không thể lưu sơ đồ.");
        const rows = await this.rpc<Row[]>("save_map", {
          p_id: doc.id,
          p_expected_version: this.versions.get(doc.id) ?? doc.version,
          p_data: clean(doc.data),
        });
        if (!rows[0]) throw Error("Không lưu được sơ đồ.");
        const saved = this.remember(rows[0]);
        // An older response must never erase a newer queued draft.
        const draft = this.drafts()[doc.id];
        if (draft?.draftRevision === draftRevision) this.clearDraft(doc.id);
        this.failures.delete(doc.id);
        return saved;
      })
      .catch((error: unknown) => {
        const value =
          error instanceof Error ? error : Error("Không lưu được sơ đồ.");
        this.failures.set(doc.id, value);
        if (
          error instanceof CloudError &&
          ["40001", "42501"].includes(error.code)
        )
          this.blocked.add(doc.id);
        throw value;
      })
      .finally(() => {
        if (this.queue.get(doc.id) === job) this.pending.delete(doc.id);
      });
    this.queue.set(doc.id, job);
    return job;
  }
  async flush(id?: string) {
    const jobs = id ? [this.queue.get(id)] : [...this.queue.values()];
    await Promise.all(jobs.filter((job): job is Promise<Doc> => Boolean(job)));
  }
  hasPending() {
    return (
      this.pending.size > 0 ||
      this.failures.size > 0 ||
      Object.keys(this.drafts()).length > 0
    );
  }
  resolveDraft(id: string) {
    if (this.pending.has(id)) throw Error("Hãy đợi lần lưu hiện tại hoàn tất.");
    this.clearDraft(id); this.queue.delete(id); this.failures.delete(id); this.blocked.delete(id);
  }
  async shares(id: string): Promise<Share[]> {
    return await this.rpc<Share[]>("list_map_shares", { p_map_id: id });
  }
  async grant(id: string, email: string, role: "viewer" | "editor") {
    await this.rpc("share_map", {
      p_map_id: id,
      p_email: email.trim().toLowerCase(),
      p_role: role,
    });
  }
  async revoke(id: string, shareId: string) {
    await this.rpc("revoke_map_share", { p_map_id: id, p_share_id: shareId });
  }
}
