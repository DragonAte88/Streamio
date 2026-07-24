export const API_BASE = "https://163-192-40-120.sslip.io";

export interface ApiChannel {
  id: number;
  tvg_id: string | null;
  name: string;
  url: string;
  logo: string | null;
  group_name: string;
}

export interface ApiUser {
  id: number;
  email: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  onboarded: boolean;
  discord_user_id: string | null;
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

export async function register(email: string, password: string, displayName?: string, username?: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName, username })
  });
  if (!res.ok) throw new Error((await res.json()).error || `register failed: ${res.status}`);
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error((await res.json()).error || `login failed: ${res.status}`);
  return res.json();
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
  const res = await fetch(`${API_BASE}/watchlist`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`watchlist fetch failed: ${res.status}`);
  return (await res.json()).channels;
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

export async function updateProfile(token: string, patch: Partial<{ displayName: string; username: string; avatarUrl: string; bio: string; onboarded: boolean; discordUserId: string }>): Promise<ApiUser> {
  const res = await fetch(`${API_BASE}/profile/me`, { method: "PATCH", headers: authHeaders(token), body: JSON.stringify(patch) });
  if (!res.ok) throw new Error((await res.json()).error || `profile update failed: ${res.status}`);
  return (await res.json()).user;
}

export async function searchUsers(token: string, q: string) {
  const res = await fetch(`${API_BASE}/profile/search?q=${encodeURIComponent(q)}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`user search failed: ${res.status}`);
  return (await res.json()).users;
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
