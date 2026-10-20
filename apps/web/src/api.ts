import { getValidAccessToken, isCognitoConfigured } from './lib/cognito';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

let authHeader: string | null = null;

export function setAuthHeader(value: string | null) {
  authHeader = value;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (isCognitoConfigured()) {
    const token = await getValidAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  } else if (authHeader) {
    headers.set('Authorization', authHeader);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data as { code?: string }).code ?? 'error',
      (data as { message?: string }).message ?? res.statusText,
      (data as { fields?: Record<string, string> }).fields,
    );
  }
  return data as T;
}
