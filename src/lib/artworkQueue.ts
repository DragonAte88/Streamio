/**
 * Persistent, Self-Healing Artwork Manager
 *
 * Maintains a persistent cache and queue for TMDB/OMDb artwork requests,
 * recovers from failed or hung network calls, and continuously backfills
 * missing artwork in the background.
 *
 * Public API (getArtwork / getCached) is unchanged; callers need no edits.
 *
 * Defects this revision fixes, all of which produced the observed
 * "artwork takes forever and sometimes crashes":
 *
 *  1. The `isProcessing` flag acted as a lock that the pump could not recover
 *     from. A re-entrant call returned early, and the only rescheduler was in
 *     `.finally()` - so if that fired while the flag was set, the pump stopped
 *     permanently with items still queued. The flag is gone; the pump is now
 *     idempotent and safe to call at any time.
 *  2. A request that never settled leaked its concurrency slot forever, since
 *     `activeCount` was only decremented in `.finally()`. Four such leaks
 *     deadlocked the manager with no way back. In-flight work is now tracked
 *     with start timestamps and reclaimed by a watchdog.
 *  3. `saveDiskCache()` ran on every single result - a synchronous
 *     JSON.stringify of up to 2000 entries per response. Across a large
 *     catalog that is a sustained main-thread stall, which is what made the UI
 *     freeze. Saves are now debounced and size-capped.
 *  4. The self-healing pass only ran when the queue was empty AND nothing was
 *     active - precisely the conditions that a wedged pump prevents, so it
 *     could never heal the failure that mattered. It now runs unconditionally
 *     and also backfills items that were never successfully enqueued.
 */

import { fetchArtwork, ArtworkResult } from "./api";

const CACHE_KEY = "streamio_artwork_cache_v1";

const MAX_CONCURRENT = 4;
const MAX_ENTRIES = 2000;
const SUCCESS_TTL_MS = 7 * 24 * 3600 * 1000; // posters rarely change
const NEGATIVE_RETRY_MS = 60 * 60 * 1000; // a miss is retried after an hour
const MAX_ATTEMPTS = 4;
/** In-flight longer than this is presumed wedged and its slot is reclaimed. */
const STALL_TIMEOUT_MS = 45000;
/** Hard ceiling on a single request, independent of fetchArtwork's own timeout. */
const REQUEST_TIMEOUT_MS = 25000;
const WATCHDOG_INTERVAL_MS = 15000;
const SWEEP_INTERVAL_MS = 60000;
const SAVE_DEBOUNCE_MS = 2000;

interface CacheEntry {
  data: ArtworkResult | null;
  timestamp: number;
  attempts?: number;
}

interface QueueItem {
  title: string;
  kind: "tv" | "movie";
  attempts: number;
  /** Earliest time this may run (backoff). */
  notBefore: number;
  callback?: (res: ArtworkResult | null) => void;
}

export interface ArtworkStatus {
  cached: number;
  withPoster: number;
  missing: number;
  queued: number;
  inFlight: number;
  registered: number;
  /** How many times the watchdog reclaimed a wedged slot. */
  revivals: number;
  lastCompletedAt: number | null;
}

function keyOf(title: string, kind: "tv" | "movie") {
  return `${kind}:${title.toLowerCase().trim()}`;
}

class ArtworkManager {
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<ArtworkResult | null>>();
  private queue: QueueItem[] = [];
  /** key -> started-at, so a watchdog can spot work that never finished. */
  private inFlight = new Map<string, number>();
  /** Everything ever asked for, so the sweep can find and fill gaps. */
  private registered = new Map<string, { title: string; kind: "tv" | "movie" }>();
  private saveTimer: any = null;
  private revivals = 0;
  private lastCompletedAt: number | null = null;

  constructor() {
    this.loadDiskCache();
    this.startSelfHealingWorker();
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private loadDiskCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        this.cache.set(k, v as CacheEntry);
      }
    } catch (e) {
      console.warn("[ArtworkManager] Failed to load disk cache", e);
    }
  }

  /**
   * Debounced. A burst of results produces one write instead of one per item,
   * which is the difference between a smooth grid and a frozen window.
   */
  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveDiskCache();
    }, SAVE_DEBOUNCE_MS);
  }

  private saveDiskCache() {
    try {
      // Keep the freshest entries, not merely the last-inserted ones.
      let entries = Array.from(this.cache.entries());
      if (entries.length > MAX_ENTRIES) {
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        entries = entries.slice(0, MAX_ENTRIES);
        this.cache = new Map(entries);
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch (e) {
      // Almost always a quota error. Shed the oldest half so the next save fits
      // rather than failing forever and losing persistence entirely.
      const entries = Array.from(this.cache.entries()).sort((a, b) => b[1].timestamp - a[1].timestamp);
      this.cache = new Map(entries.slice(0, Math.floor(entries.length / 2)));
      console.warn("[ArtworkManager] Cache save failed, trimmed cache", e);
    }
  }

  // ── Public API (unchanged signatures) ────────────────────────────────────

  public getCached(title: string, kind: "tv" | "movie" = "tv"): ArtworkResult | null | undefined {
    const entry = this.cache.get(keyOf(title, kind));
    if (!entry) return undefined;

    const age = Date.now() - entry.timestamp;
    if (entry.data && age < SUCCESS_TTL_MS) return entry.data;
    // A known miss is reported as a miss until it is due for another attempt,
    // so the UI can stop showing a spinner instead of hanging on it.
    if (!entry.data && age < NEGATIVE_RETRY_MS) return entry.data;
    return undefined;
  }

  public async getArtwork(title: string, kind: "tv" | "movie" = "tv"): Promise<ArtworkResult | null> {
    if (!title || !title.trim()) return null;

    const key = keyOf(title, kind);
    this.registered.set(key, { title, kind });

    const cached = this.getCached(title, kind);
    if (cached !== undefined) return cached;

    const existing = this.pending.get(key);
    if (existing) return existing;

    const promise = new Promise<ArtworkResult | null>((resolve) => {
      this.queue.push({ title, kind, attempts: 0, notBefore: 0, callback: resolve });
      this.pump();
    });

    this.pending.set(key, promise);
    return promise;
  }

  /** Live counters for a status panel. */
  public status(): ArtworkStatus {
    let withPoster = 0;
    let missing = 0;
    for (const e of this.cache.values()) {
      if (e.data?.poster) withPoster++;
      else missing++;
    }
    return {
      cached: this.cache.size,
      withPoster,
      missing,
      queued: this.queue.length,
      inFlight: this.inFlight.size,
      registered: this.registered.size,
      revivals: this.revivals,
      lastCompletedAt: this.lastCompletedAt
    };
  }

  /** Drop everything and refetch from scratch (used by "Refresh All"). */
  public reset() {
    this.cache.clear();
    this.queue = [];
    this.pending.clear();
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
    this.backfill(true);
  }

  /** Force an immediate sweep for anything still missing. */
  public healNow() {
    this.backfill(false);
  }

  // ── Scheduling ───────────────────────────────────────────────────────────

  private enqueue(item: QueueItem) {
    const key = keyOf(item.title, item.kind);
    if (this.inFlight.has(key)) return;
    if (this.queue.some((q) => keyOf(q.title, q.kind) === key)) return;
    this.queue.push(item);
  }

  /**
   * Fill idle slots. Deliberately has no lock: it is cheap, idempotent, and
   * safe to call from anywhere. The previous lock was the reason the queue
   * could stop permanently.
   */
  private pump() {
    while (this.inFlight.size < MAX_CONCURRENT) {
      const now = Date.now();
      const idx = this.queue.findIndex((q) => q.notBefore <= now);
      if (idx === -1) return;
      const [item] = this.queue.splice(idx, 1);
      void this.run(item);
    }
  }

  private async run(item: QueueItem) {
    const key = keyOf(item.title, item.kind);
    this.inFlight.set(key, Date.now());

    try {
      // Independent ceiling: even if fetchArtwork's own abort fails to fire,
      // this slot is guaranteed to be released.
      const res = await Promise.race([
        fetchArtwork(item.title, item.kind),
        new Promise<null>((r) => setTimeout(() => r(null), REQUEST_TIMEOUT_MS))
      ]);

      const attempts = item.attempts + 1;

      if (res?.poster) {
        this.commit(key, { data: res, timestamp: Date.now(), attempts }, item, res);
        return;
      }

      if (attempts >= MAX_ATTEMPTS) {
        // Record the miss so the UI settles. The sweep will revisit it once
        // NEGATIVE_RETRY_MS has elapsed - a miss is never permanent.
        this.commit(key, { data: null, timestamp: Date.now(), attempts }, item, null);
        return;
      }

      // Exponential backoff with jitter so a transient upstream failure does
      // not make every queued item retry in lockstep.
      const delay = Math.min(30000, 1000 * 2 ** attempts) + Math.random() * 1000;
      this.queue.push({ ...item, attempts, notBefore: Date.now() + delay });
    } catch {
      const attempts = item.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        this.commit(key, { data: null, timestamp: Date.now(), attempts }, item, null);
      } else {
        this.queue.push({ ...item, attempts, notBefore: Date.now() + 1000 * 2 ** attempts });
      }
    } finally {
      this.inFlight.delete(key);
      this.pending.delete(key);
      this.lastCompletedAt = Date.now();
      this.pump();
    }
  }

  private commit(key: string, entry: CacheEntry, item: QueueItem, res: ArtworkResult | null) {
    this.cache.set(key, entry);
    this.scheduleSave();
    if (item.callback) {
      try {
        item.callback(res);
      } catch {
        // A throwing consumer must not break the queue.
      }
    }
  }

  // ── Self-healing ─────────────────────────────────────────────────────────

  /**
   * Re-enqueue anything still missing artwork: cached misses that are due for
   * another attempt, and registered items that never landed in the cache at
   * all (a request lost to a reload or a wedged pump).
   */
  private backfill(force: boolean) {
    const now = Date.now();

    for (const [key, reg] of this.registered) {
      const entry = this.cache.get(key);
      if (!force) {
        if (entry?.data?.poster) continue;
        if (entry && now - entry.timestamp < NEGATIVE_RETRY_MS) continue;
      }
      if (force || entry) this.cache.delete(key);
      this.enqueue({ title: reg.title, kind: reg.kind, attempts: 0, notBefore: 0 });
    }

    // Cached misses whose titles were never registered this session (e.g. the
    // app restarted) still deserve a retry once they are due.
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (entry.data || this.registered.has(key)) continue;
      if (!force && now - entry.timestamp < NEGATIVE_RETRY_MS) continue;
      const sep = key.indexOf(":");
      const kind = key.slice(0, sep) as "tv" | "movie";
      const title = key.slice(sep + 1);
      if (!title) continue;
      this.cache.delete(key);
      this.enqueue({ title, kind, attempts: 0, notBefore: 0 });
    }

    this.pump();
  }

  private startSelfHealingWorker() {
    // Watchdog: reclaim slots held by work that never settled, and keep the
    // pump alive. This runs regardless of queue state - the old version only
    // ran when idle, which is exactly when it was not needed.
    setInterval(() => {
      const now = Date.now();
      for (const [key, startedAt] of Array.from(this.inFlight)) {
        if (now - startedAt > STALL_TIMEOUT_MS) {
          this.inFlight.delete(key);
          this.pending.delete(key);
          this.revivals++;
          const reg = this.registered.get(key);
          if (reg) {
            this.enqueue({ title: reg.title, kind: reg.kind, attempts: 0, notBefore: now + 2000 });
          }
          console.warn("[ArtworkManager] Reclaimed stalled slot:", key);
        }
      }
      this.pump();
    }, WATCHDOG_INTERVAL_MS);

    // Continuous backfill of remaining gaps.
    setInterval(() => this.backfill(false), SWEEP_INTERVAL_MS);

    // Network coming back is the single best moment to retry everything that
    // failed while it was down.
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.backfill(false));
    }
  }
}

export const artworkManager = new ArtworkManager();
