const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function api(path, { token, ...options } = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new Error(data?.error || `Error ${response.status}: no se pudo completar la solicitud`);
  }
  return data;
}

export const money = (amount) => new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 2,
}).format(Number(amount) || 0);

export const dateTime = (value) => new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));
