/** Backend client. Each browser gets its own workspace id so one visitor never sees another's cases. Photos are never sent. */
const KEY = 'fs.workspace';

export function workspaceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
    return id;
  } catch { return sessionWs; }
}
const sessionWs = crypto.randomUUID();

export interface CaseRecord { id: string; code: string; created_at: string; summary: Record<string, unknown>; thumb: string | null }
export class ApiError extends Error { constructor(readonly status: number, readonly detail: string) { super(detail); } }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Workspace': workspaceId(), ...(init?.headers ?? {}) } });
  if (!r.ok) { let d = r.statusText; try { d = (await r.json()).detail ?? d; } catch { /* not json */ } throw new ApiError(r.status, String(d)); }
  return r.status === 204 ? (undefined as T) : r.json();
}

export const api = {
  health: () => call<{ status: string; db: string; models: Record<string, boolean> }>('/health'),
  list: () => call<CaseRecord[]>('/cases'),
  save: (code: string, summary: Record<string, unknown>, thumb: string | null) => call<CaseRecord>('/cases', { method: 'POST', body: JSON.stringify({ code, summary, thumb }) }),
  remove: (id: string) => call<void>(`/cases/${id}`, { method: 'DELETE' }),
  segment: (imageB64: string, point: [number, number]) => call<{ mask_b64: string; width: number; height: number }>('/segment', { method: 'POST', body: JSON.stringify({ image_b64: imageB64, point }) }),
};
