import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { unlink, readFile } from "node:fs/promises";
import { CustomDataStore } from "../src/custom-store";

const TEST_FILE = join(import.meta.dirname!, "fixtures", "custom-store-test.json");

async function cleanup() {
  for (const f of [TEST_FILE, `${TEST_FILE}.tmp`]) {
    try {
      await unlink(f);
    } catch {}
  }
}

describe("CustomDataStore", () => {
  afterEach(cleanup);

  it("creates a store and starts empty when file does not exist", async () => {
    const store = await CustomDataStore.create(TEST_FILE);
    expect(store.size).toBe(0);
    await store.close();
  });

  it("set and get work synchronously", async () => {
    const store = await CustomDataStore.create(TEST_FILE);
    store.set("10.0.0.1", { country: "Internal" });

    expect(store.get("10.0.0.1")).toEqual({ country: "Internal" });
    expect(store.has("10.0.0.1")).toBe(true);
    expect(store.size).toBe(1);
    await store.close();
  });

  it("delete removes an entry", async () => {
    const store = await CustomDataStore.create(TEST_FILE);
    store.set("10.0.0.1", { country: "Internal" });

    expect(store.delete("10.0.0.1")).toBe(true);
    expect(store.has("10.0.0.1")).toBe(false);
    expect(store.delete("10.0.0.1")).toBe(false); // already gone
    await store.close();
  });

  it("clear removes all entries", async () => {
    const store = await CustomDataStore.create(TEST_FILE);
    store.set("10.0.0.1", { country: "A" });
    store.set("10.0.0.2", { country: "B" });

    store.clear();
    expect(store.size).toBe(0);
    expect(store.has("10.0.0.1")).toBe(false);
    await store.close();
  });

  it("setBulk sets multiple entries", async () => {
    const store = await CustomDataStore.create(TEST_FILE);
    store.setBulk([
      { ip: "10.0.0.1", data: { organization: "Org1" } },
      { ip: "10.0.0.2", data: { organization: "Org2" } },
      { ip: "10.0.0.3", data: { organization: "Org3" } },
    ]);

    expect(store.size).toBe(3);
    expect(store.get("10.0.0.2")).toEqual({ organization: "Org2" });
    await store.close();
  });

  it("entries() iterates all entries", async () => {
    const store = await CustomDataStore.create(TEST_FILE);
    store.set("10.0.0.1", { city: "A" });
    store.set("10.0.0.2", { city: "B" });

    const entries = [...store.entries()];
    expect(entries).toHaveLength(2);
    expect(entries.map(([ip]) => ip).sort()).toEqual(["10.0.0.1", "10.0.0.2"]);
    await store.close();
  });

  it("persists data to disk on flush", async () => {
    const store = await CustomDataStore.create(TEST_FILE, 100_000); // long debounce
    store.set("10.0.0.1", { country: "Persisted" });

    await store.flush();

    const raw = await readFile(TEST_FILE, "utf-8");
    const data = JSON.parse(raw);
    expect(data["10.0.0.1"]).toEqual({ country: "Persisted" });
    await store.close();
  });

  it("close() flushes pending changes", async () => {
    const store = await CustomDataStore.create(TEST_FILE, 100_000);
    store.set("10.0.0.1", { city: "Flushed" });

    await store.close(); // should flush

    const raw = await readFile(TEST_FILE, "utf-8");
    const data = JSON.parse(raw);
    expect(data["10.0.0.1"]).toEqual({ city: "Flushed" });
  });

  it("survives restart — loads persisted data", async () => {
    // Write data
    const store1 = await CustomDataStore.create(TEST_FILE);
    store1.set("10.0.0.1", { organization: "Survives" });
    await store1.close();

    // Re-open — data should be there
    const store2 = await CustomDataStore.create(TEST_FILE);
    expect(store2.get("10.0.0.1")).toEqual({ organization: "Survives" });
    expect(store2.size).toBe(1);
    await store2.close();
  });

  it("flush is a no-op when nothing changed", async () => {
    const store = await CustomDataStore.create(TEST_FILE);
    // No set calls — flush should be fine
    await store.flush();
    await store.close();
  });
});
