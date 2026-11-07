// Set to your computer/phone IP or deployed HTTPS domain.
export const API = 'http://10.0.2.2:3000/api/v1';
let access = '';
export const setToken = (t: string) => { access = t; };
export async function call<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j.error ?? j));
  return j;
}
