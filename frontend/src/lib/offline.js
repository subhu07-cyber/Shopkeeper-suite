import Dexie from "dexie";

export const odb = new Dexie("shopkeeper_offline");
odb.version(1).stores({ queue: "++qid, created_at", cache: "key" });

export const cacheSet = (key, data) => odb.cache.put({ key, data, ts: Date.now() }).catch(() => {});
export const cacheRead = async (key) => (await odb.cache.get(key).catch(() => null))?.data;

export const pendingCount = () => odb.queue.count();

export const queueRequest = async (url, body) => {
  await odb.queue.add({ url, body, created_at: new Date().toISOString() });
  window.dispatchEvent(new Event("offline-queue-changed"));
};

let flushing = false;

export const flushQueue = async (api) => {
  if (flushing) return { synced: 0, failed: 0 };
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    const items = await odb.queue.orderBy("qid").toArray();
    for (const it of items) {
      try {
        await api.post(it.url, it.body);
        await odb.queue.delete(it.qid);
        synced++;
      } catch (e) {
        if (e.response) { await odb.queue.delete(it.qid); failed++; }
        else break;
      }
    }
  } finally {
    flushing = false;
  }
  if (synced || failed) window.dispatchEvent(new Event("offline-queue-changed"));
  return { synced, failed };
};
