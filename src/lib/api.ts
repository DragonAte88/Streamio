export const API_BASE = "https://163-192-40-120.sslip.io";

export interface ApiChannel {
  id: number;
  tvg_id: string | null;
  name: string;
  url: string;
  logo: string | null;
  group_name: string;
}

export type PresenceStatus = "online" | "idle" | "dnd" | "invisible" | "offline";

export interface ApiUser {
  id: number;
  email: string;
  display_name: string | null;
  username: string | null;
  discriminator: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  accent_color: string | null;
  bio: string | null;
  onboarded: boolean;
  status: PresenceStatus;
  role: "user" | "admin";
  can_upload_assets: boolean;
  suspended: boolean;
  suspended_reason?: string | null;
  discord_user_id: string | null;
  discord_username?: string | null;
  discord_avatar_url?: string | null;
  privacy_show_activity?: boolean;
  privacy_allow_friend_requests?: boolean;
}

export interface ApiAsset {
  id: number;
  uploader_id: number;
  username: string;
  discriminator: string;
  filename: string;
  url: string;
  kind: "video" | "audio" | "image";
  title: string;
  category: string;
  published_channel_id: number | null;
  created_at: string;
}

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function fetchCatalog(): Promise<ApiChannel[]> {
  const res = await fetch(`${API_BASE}/channels`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const data = await res.json();
  return data.channels;
}

export interface ArtworkResult {
  title: string;
  resolvedName: string | null;
  poster: string | null;
  background: string | null;
  overview: string | null;
  source: string | null;
}

/** Fetch artwork (poster, backdrop, overview) for a title via the backend proxy.
 *  kind: "tv" (default) or "movie" */
export async function fetchArtwork(title: string, kind: "tv" | "movie" = "tv"): Promise<ArtworkResult | null> {
  try {
    const res = await fetch(
      `${API_BASE}/artwork/search?title=${encodeURIComponent(title)}&kind=${kind}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function register(email: string, password: string, displayName?: string, username?: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName, username })
  });
  if (!res.ok) throw new Error((await res.json()).error || `register failed: ${res.status}`);
  return res.json();
}

export class SuspendedAccountError extends Error {
  reactivateToken: string;
  user: ApiUser;
  constructor(reactivateToken: string, user: ApiUser) {
    super("account suspended");
    this.reactivateToken = reactivateToken;
    this.user = user;
  }
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (res.status === 423) {
    const data = await res.json();
    throw new SuspendedAccountError(data.suspendedReactivateToken, data.user);
  }
  if (!res.ok) throw new Error((await res.json()).error || `login failed: ${res.status}`);
  return res.json();
}

export async function reactivateAccount(reactivateToken: string) {
  const res = await fetch(`${API_BASE}/account/reactivate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: reactivateToken })
  });
  if (!res.ok) throw new Error((await res.json()).error || `reactivate failed: ${res.status}`);
  return res.json();
}

export async function suspendMyAccount(token: string, reason?: string) {
  await fetch(`${API_BASE}/account/suspend`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ reason }) });
}

export async function wipeMyAccount(token: string) {
  await fetch(`${API_BASE}/account/wipe`, { method: "DELETE", headers: authHeaders(token) });
}

export async function addChannel(
  token: string,
  channel: { name: string; url: string; logo?: string; group?: string; tvgId?: string }
) {
  const res = await fetch(`${API_BASE}/channels`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(channel)
  });
  if (!res.ok) throw new Error(`add channel failed: ${res.status}`);
  return res.json();
}

export async function fetchWatchlist(token: string): Promise<ApiChannel[]> {
  const res = await fetch(`${API_BASE}/watchlist`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to load watchlist");
  const data = await res.json();
  return data.channels;
}

export async function fetchWatchHistory(token: string): Promise<ApiChannel[]> {
  const res = await fetch(`${API_BASE}/watchlist/history`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to load recently watched history");
  const data = await res.json();
  return data.channels;
}

export async function addToWatchlist(token: string, channelId: string) {
  await fetch(`${API_BASE}/watchlist/${channelId}`, { method: "POST", headers: authHeaders(token) });
}

export async function removeFromWatchlist(token: string, channelId: string) {
  await fetch(`${API_BASE}/watchlist/${channelId}`, { method: "DELETE", headers: authHeaders(token) });
}

export async function recordHistory(token: string, channelId: string) {
  await fetch(`${API_BASE}/watchlist/${channelId}/history`, { method: "POST", headers: authHeaders(token) });
}

// --- Profile ---

export async function updateProfile(
  token: string,
  patch: Partial<{
    displayName: string;
    avatarUrl: string;
    bannerUrl: string;
    accentColor: string;
    bio: string;
    onboarded: boolean;
    discordUserId: string;
    privacyShowActivity: boolean;
    privacyAllowFriendRequests: boolean;
  }>
): Promise<ApiUser> {
  const res = await fetch(`${API_BASE}/profile/me`, { method: "PATCH", headers: authHeaders(token), body: JSON.stringify(patch) });
  if (!res.ok) throw new Error((await res.json()).error || `profile update failed: ${res.status}`);
  return (await res.json()).user;
}

export async function fetchUserProfile(token: string, userId: number): Promise<ApiUser> {
  const res = await fetch(`${API_BASE}/profile/${userId}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`);
  return (await res.json()).user;
}

export async function setPresence(token: string, status: PresenceStatus) {
  await fetch(`${API_BASE}/profile/presence`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ status }) });
}

export async function searchUsers(token: string, q: string) {
  const res = await fetch(`${API_BASE}/profile/search?q=${encodeURIComponent(q)}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`user search failed: ${res.status}`);
  return (await res.json()).users;
}

// --- Discord OAuth ---

export async function exchangeDiscordCode(token: string, code: string) {
  const res = await fetch(`${API_BASE}/auth/discord/callback`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ code }) });
  if (!res.ok) throw new Error((await res.json()).error || `Discord link failed: ${res.status}`);
  return (await res.json()).user;
}

export async function unlinkDiscord(token: string) {
  await fetch(`${API_BASE}/auth/discord/unlink`, { method: "POST", headers: authHeaders(token) });
}

// --- Admin ---

export async function adminListUsers(token: string) {
  const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`admin list failed: ${res.status}`);
  return (await res.json()).users;
}

export async function adminSuspendUser(token: string, userId: number, reason?: string) {
  await fetch(`${API_BASE}/admin/users/${userId}/suspend`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ reason }) });
}

export async function adminUnsuspendUser(token: string, userId: number) {
  await fetch(`${API_BASE}/admin/users/${userId}/unsuspend`, { method: "POST", headers: authHeaders(token) });
}

export async function adminDeleteUser(token: string, userId: number) {
  await fetch(`${API_BASE}/admin/users/${userId}`, { method: "DELETE", headers: authHeaders(token) });
}

export async function adminGrantUpload(token: string, userId: number) {
  await fetch(`${API_BASE}/admin/users/${userId}/grant-upload`, { method: "POST", headers: authHeaders(token) });
}

export async function adminRevokeUpload(token: string, userId: number) {
  await fetch(`${API_BASE}/admin/users/${userId}/revoke-upload`, { method: "POST", headers: authHeaders(token) });
}

export async function fetchAdminStats(token: string) {
  const res = await fetch(`${API_BASE}/admin/stats`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`stats fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchUserBadges(token: string, userId: number): Promise<string[]> {
  const res = await fetch(`${API_BASE}/badges/user/${userId}`, { headers: authHeaders(token) });
  if (!res.ok) return [];
  const data = await res.json();
  return data.badges.map((b: any) => b.badge_slug);
}

export async function grantBadge(token: string, userId: number, slug: string) {
  await fetch(`${API_BASE}/badges/user/${userId}/${slug}`, { method: "POST", headers: authHeaders(token) });
}

export async function revokeBadge(token: string, userId: number, slug: string) {
  await fetch(`${API_BASE}/badges/user/${userId}/${slug}`, { method: "DELETE", headers: authHeaders(token) });
}

export async function fetchAdminLogs(token: string) {
  const res = await fetch(`${API_BASE}/admin/logs`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`logs fetch failed: ${res.status}`);
  return (await res.json()).logs;
}

// --- Assets ---

export async function fetchAssets(token: string): Promise<ApiAsset[]> {
  const res = await fetch(`${API_BASE}/assets`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`assets fetch failed: ${res.status}`);
  return (await res.json()).assets;
}

export async function uploadAsset(token: string, file: File, title: string, category: string, onProgress?: (pct: number) => void): Promise<ApiAsset> {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  form.append("category", category);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/assets`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText).asset);
      else reject(new Error(`upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.send(form);
  });
}

export async function updateAsset(token: string, assetId: number, patch: Partial<{ title: string; category: string; publish: boolean }>): Promise<ApiAsset> {
  const res = await fetch(`${API_BASE}/assets/${assetId}`, { method: "PATCH", headers: authHeaders(token), body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`asset update failed: ${res.status}`);
  return (await res.json()).asset;
}

export async function deleteAsset(token: string, assetId: number) {
  await fetch(`${API_BASE}/assets/${assetId}`, { method: "DELETE", headers: authHeaders(token) });
}

// --- Social: friends ---

export async function sendFriendRequest(token: string, toUserId: number) {
  await fetch(`${API_BASE}/social/friends/requests/${toUserId}`, { method: "POST", headers: authHeaders(token) });
}

export async function fetchIncomingFriendRequests(token: string) {
  const res = await fetch(`${API_BASE}/social/friends/requests/incoming`, { headers: authHeaders(token) });
  return (await res.json()).requests;
}

export async function respondFriendRequest(token: string, requestId: number, accept: boolean) {
  await fetch(`${API_BASE}/social/friends/requests/${requestId}/${accept ? "accept" : "decline"}`, {
    method: "POST",
    headers: authHeaders(token)
  });
}

export async function fetchFriends(token: string) {
  const res = await fetch(`${API_BASE}/social/friends`, { headers: authHeaders(token) });
  return (await res.json()).friends;
}

// --- Social: direct messages ---

export async function fetchDirectMessages(token: string, userId: number) {
  const res = await fetch(`${API_BASE}/social/dm/${userId}`, { headers: authHeaders(token) });
  return (await res.json()).messages;
}

export async function sendDirectMessage(token: string, userId: number, body: string) {
  const res = await fetch(`${API_BASE}/social/dm/${userId}`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ body }) });
  return (await res.json()).message;
}

// --- Social: rooms ---

export async function fetchRooms(token: string) {
  const res = await fetch(`${API_BASE}/social/rooms`, { headers: authHeaders(token) });
  return (await res.json()).rooms;
}

export async function createRoom(token: string, name: string, isPublic: boolean) {
  const res = await fetch(`${API_BASE}/social/rooms`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ name, isPublic }) });
  return (await res.json()).room;
}

export async function joinRoom(token: string, roomId: number) {
  await fetch(`${API_BASE}/social/rooms/${roomId}/join`, { method: "POST", headers: authHeaders(token) });
}

export async function leaveRoom(token: string, roomId: number) {
  await fetch(`${API_BASE}/social/rooms/${roomId}/leave`, { method: "POST", headers: authHeaders(token) });
}

export async function fetchRoom(token: string, roomId: number) {
  const res = await fetch(`${API_BASE}/social/rooms/${roomId}`, { headers: authHeaders(token) });
  return res.json();
}

export async function syncRoomChannel(token: string, roomId: number, channelId: number) {
  await fetch(`${API_BASE}/social/rooms/${roomId}/sync`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ channelId }) });
}

export async function fetchRoomMessages(token: string, roomId: number) {
  const res = await fetch(`${API_BASE}/social/rooms/${roomId}/messages`, { headers: authHeaders(token) });
  return (await res.json()).messages;
}

export async function sendRoomMessage(token: string, roomId: number, body: string) {
  const res = await fetch(`${API_BASE}/social/rooms/${roomId}/messages`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ body }) });
  return (await res.json()).message;
}

export async function markRoomRead(token: string, roomId: number, messageId: number) {
  await fetch(`${API_BASE}/social/rooms/${roomId}/read`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ messageId }) });
}

export async function fetchRoomReads(token: string, roomId: number) {
  const res = await fetch(`${API_BASE}/social/rooms/${roomId}/reads`, { headers: authHeaders(token) });
  return (await res.json()).reads;
}

export async function sendTyping(token: string, roomId: number) {
  await fetch(`${API_BASE}/social/rooms/${roomId}/typing`, { method: "POST", headers: authHeaders(token) });
}

export async function fetchTyping(token: string, roomId: number) {
  const res = await fetch(`${API_BASE}/social/rooms/${roomId}/typing`, { headers: authHeaders(token) });
  return (await res.json()).typing;
}

// --- Invite to watch ---

export async function inviteToRoom(token: string, roomId: number, toUserId: number) {
  await fetch(`${API_BASE}/social/rooms/${roomId}/invite/${toUserId}`, { method: "POST", headers: authHeaders(token) });
}

export async function fetchInvites(token: string) {
  const res = await fetch(`${API_BASE}/social/invites`, { headers: authHeaders(token) });
  return (await res.json()).invites;
}

export async function acceptInvite(token: string, inviteId: number): Promise<{ roomId: number }> {
  const res = await fetch(`${API_BASE}/social/invites/${inviteId}/accept`, { method: "POST", headers: authHeaders(token) });
  return res.json();
}

export async function declineInvite(token: string, inviteId: number) {
  await fetch(`${API_BASE}/social/invites/${inviteId}/decline`, { method: "POST", headers: authHeaders(token) });
}
