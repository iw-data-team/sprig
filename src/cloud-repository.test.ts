import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { CloudRepository } from "./cloud/repository";
import type { Doc } from "./cloud/repository";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const data = (topic: string) => ({
  nodeData: { id: "root", topic },
  direction: 1,
}) as Doc["data"];
const user = { id: "user-1" } as User;
const row = (version: number, dataValue: Doc["data"]) => ({
  id: "map-1",
  data: dataValue,
  updated_at: new Date(version * 1000).toISOString(),
  owner_id: user.id,
  role: "owner" as const,
  version,
});

test("cloud saves serialize versions and only clear the exact draft they saved", async () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  let version = 1;
  const calls: Array<{ expected: number; topic: string }> = [];
  let releaseFirst!: (value: { data: unknown; error: null }) => void;
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      if (name === "create_map") return Promise.resolve({ data: [row(1, args.p_data as Doc["data"])], error: null });
      assert.equal(name, "save_map");
      calls.push({ expected: args.p_expected_version as number, topic: (args.p_data as Doc["data"]).nodeData.topic });
      if (calls.length === 1) return new Promise((resolve) => { releaseFirst = resolve; });
      version += 1;
      return Promise.resolve({ data: [row(version, args.p_data as Doc["data"])], error: null });
    },
  } as unknown as SupabaseClient;
  const repo = new CloudRepository(client, user);
  await repo.create(data("Start"), "map-1");
  const first = { id: "map-1", data: data("first"), updated: 7, version: 1 } satisfies Doc;
  const second = { id: "map-1", data: data("second"), updated: 7, version: 1 } satisfies Doc;
  const savingFirst = repo.save(first);
  await Promise.resolve();
  const savingSecond = repo.save(second);
  second.data.nodeData.topic = "mutated after enqueue";
  version = 2;
  releaseFirst({ data: [row(2, first.data)], error: null });
  await Promise.all([savingFirst, savingSecond]);

  assert.deepEqual(calls, [
    { expected: 1, topic: "first" },
    { expected: 2, topic: "second" },
  ]);
  assert.equal(repo.drafts()["map-1"], undefined);
  assert.equal(repo.hasPending(), false);
});

test("drafts are isolated by account and unresolved failures remain pending", async () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  const failingClient = {
    rpc() { return Promise.resolve({ data: null, error: { code: "40001", message: "conflict" } }); },
  } as unknown as SupabaseClient;
  const first = new CloudRepository(failingClient, user);
  const second = new CloudRepository(failingClient, { id: "user-2" } as User);
  first.stage({ id: "map-1", data: data("private draft"), updated: 1 });
  assert.equal(first.drafts()["map-1"]?.data.nodeData.topic, "private draft");
  assert.deepEqual(second.drafts(), {});
  // Associate an expected version so save reaches the mock RPC.
  await assert.rejects(first.save({ id: "map-1", data: data("conflict draft"), updated: 2, version: 1 }));
  assert.equal(first.hasPending(), true);
  assert.equal(second.hasPending(), false);
  first.resolveDraft("map-1");
  assert.equal(first.hasPending(), false);
});


test("opening cloud preserves an unresolved draft separately from future edits", async () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  const client = { rpc(name: string, args: Record<string, unknown>) {
    return Promise.resolve({ error: null, data: [row(name === "save_map" ? 2 : 1, name === "save_map" ? args.p_data as Doc["data"] : data("cloud"))] });
  }} as unknown as SupabaseClient;
  const repo = new CloudRepository(client, user);
  repo.stage({ id: "map-1", data: data("old unsynced work"), updated: 1 });
  await repo.get("map-1");
  await repo.save({ id: "map-1", data: data("new edit"), updated: 2, version: 1 });
  const drafts = Object.values(repo.drafts());
  assert.equal(drafts.length, 1);
  assert.notEqual(drafts[0].id, "map-1");
  assert.equal(drafts[0].data.nodeData.topic, "old unsynced work");
  repo.preserveDrafts();
  assert.equal(Object.values(repo.drafts())[0].id, drafts[0].id);
});
