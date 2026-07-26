import { Channel } from "./playlist";
import { FriendActivityItem, WatchStats } from "./api";

/**
 * Recommendation scoring.
 *
 * Deliberately transparent rather than clever: every recommendation carries the
 * reason it was chosen, and the reason is shown in the UI. A black-box score
 * users can't interpret is worse than a simple one they can, especially at this
 * data scale - a personal library has hundreds of items, not millions, so
 * collaborative filtering has nothing to work with.
 *
 * All signals are real:
 *   - taste     : how much the user actually watches each category
 *   - social    : what friends have played (only friends who allow activity sharing)
 *   - freshness : recently added catalog entries
 *   - novelty   : penalises things already watched, so rows aren't all repeats
 */

export interface ScoredChannel {
  channel: Channel;
  score: number;
  /** Human-readable justification, surfaced in the UI. */
  reason: string;
}

export interface RecommendInput {
  catalog: Channel[];
  stats: WatchStats | null;
  friendsActivity: FriendActivityItem[];
  watchedIds: Set<string>;
  watchlistIds: Set<string>;
}

/** Normalised 0..1 weight per category, from real watch seconds (falling back to play counts). */
export function tasteProfile(stats: WatchStats | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!stats?.byGroup?.length) return out;

  // Seconds is the better signal, but it is only present once progress
  // reporting has run for a while. Fall back to play counts so a new account
  // still gets sensible ordering instead of nothing.
  const useSeconds = stats.byGroup.some((g) => g.seconds > 0);
  const value = (g: { plays: number; seconds: number }) => (useSeconds ? g.seconds : g.plays);
  const max = Math.max(...stats.byGroup.map(value), 1);

  for (const g of stats.byGroup) {
    if (g.group_name) out.set(g.group_name, value(g) / max);
  }
  return out;
}

export function recommend(input: RecommendInput, limit = 20): ScoredChannel[] {
  const { catalog, stats, friendsActivity, watchedIds, watchlistIds } = input;
  const taste = tasteProfile(stats);

  // How many distinct friends played each channel, and who the first one was.
  const friendCounts = new Map<string, { count: number; names: Set<string> }>();
  for (const f of friendsActivity) {
    const id = String(f.id);
    const entry = friendCounts.get(id) || { count: 0, names: new Set<string>() };
    entry.count += 1;
    const who = f.display_name || f.username;
    if (who) entry.names.add(who);
    friendCounts.set(id, entry);
  }

  const scored: ScoredChannel[] = [];

  for (const ch of catalog) {
    const id = String(ch.id);
    let score = 0;
    const reasons: { weight: number; text: string }[] = [];

    const tasteWeight = taste.get(ch.group) ?? 0;
    if (tasteWeight > 0) {
      score += tasteWeight * 50;
      reasons.push({ weight: tasteWeight * 50, text: `You watch a lot of ${ch.group}` });
    }

    const friends = friendCounts.get(id);
    if (friends) {
      score += 30 + Math.min(friends.count, 5) * 6;
      const names = Array.from(friends.names);
      reasons.push({
        weight: 30,
        text:
          names.length === 0
            ? "Watched by friends"
            : names.length === 1
            ? `${names[0]} watched this`
            : `${names[0]} and ${names.length - 1} other${names.length > 2 ? "s" : ""} watched this`
      });
    }

    // Newer catalog rows have higher serial ids. Only meaningful for the
    // backend catalog; demo playlists use non-numeric ids and score 0 here.
    const numericId = Number(ch.id);
    if (Number.isFinite(numericId)) {
      const maxId = Math.max(...catalog.map((c) => Number(c.id)).filter(Number.isFinite), 1);
      const freshness = numericId / maxId;
      if (freshness > 0.85) {
        score += 12;
        reasons.push({ weight: 12, text: "Recently added" });
      }
    }

    if (ch.logo) score += 3; // presentation quality: a row of blank tiles looks broken

    // Already-seen material is demoted, not removed - a favourite channel
    // should still be able to surface, just not crowd out everything new.
    if (watchedIds.has(id)) score *= 0.35;
    if (watchlistIds.has(id)) score *= 0.5;

    if (score <= 0) continue;

    reasons.sort((a, b) => b.weight - a.weight);
    scored.push({ channel: ch, score, reason: reasons[0]?.text || "Suggested for you" });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** "More like this" - same category, excluding the seed itself. */
export function similarTo(seed: Channel, catalog: Channel[], limit = 20): Channel[] {
  return catalog
    .filter((c) => c.id !== seed.id && c.group === seed.group)
    .slice(0, limit);
}

export interface HomeRow {
  key: string;
  title: string;
  subtitle?: string;
  items: Channel[];
  /** Per-item reasons, aligned by index with `items`. */
  reasons?: string[];
}

/**
 * Build the Home rows. Rows with no content are dropped entirely rather than
 * rendered empty, so a new account sees a short honest page instead of a wall
 * of empty shelves.
 */
export function buildHomeRows(input: RecommendInput, catalog: Channel[]): HomeRow[] {
  const rows: HomeRow[] = [];
  const picks = recommend(input, 20);

  if (picks.length) {
    rows.push({
      key: "for-you",
      title: "For You",
      subtitle: "Based on what you watch and what your friends are watching",
      items: picks.map((p) => p.channel),
      reasons: picks.map((p) => p.reason)
    });
  }

  const friendItems: Channel[] = [];
  const friendReasons: string[] = [];
  const seenFriendIds = new Set<string>();
  for (const f of input.friendsActivity) {
    const id = String(f.id);
    if (seenFriendIds.has(id)) continue;
    seenFriendIds.add(id);
    friendItems.push({
      id,
      name: f.name,
      url: f.url,
      logo: f.logo || undefined,
      group: f.group_name,
      tvgId: f.tvg_id || undefined
    });
    friendReasons.push(`${f.display_name || f.username || "A friend"} watched this`);
  }
  if (friendItems.length) {
    rows.push({
      key: "friends",
      title: "Friends are watching",
      subtitle: "Only from friends who share their activity",
      items: friendItems.slice(0, 20),
      reasons: friendReasons.slice(0, 20)
    });
  }

  // One row per category the user actually watches, strongest first.
  const taste = tasteProfile(input.stats);
  const topGroups = Array.from(taste.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  for (const [group] of topGroups) {
    const items = catalog.filter((c) => c.group === group).slice(0, 20);
    if (items.length >= 3) {
      rows.push({ key: `taste-${group}`, title: `More ${group}`, items });
    }
  }

  return rows;
}
