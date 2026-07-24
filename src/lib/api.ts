export const API_BASE = "https://163-192-40-120.sslip.io";

export interface ApiChannel {
  id: number;
  tvg_id: string | null;
  name: string;
  url: string;
  logo: string | null;
  group_name: string;
}

export async function fetchCatalog(): Promise<ApiChannel[]> {
  const res = await fetch(`${API_BASE}/channels`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const data = await res.json();
  return data.channels;
}

export async function register(email: string, password: string, displayName?: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName })
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
