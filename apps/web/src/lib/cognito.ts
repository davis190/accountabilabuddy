const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN ?? '';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID ?? '';

const PKCE_VERIFIER_KEY = 'ab.pkce.verifier';
const PKCE_STATE_KEY = 'ab.pkce.state';
const TOKENS_KEY = 'ab.tokens';

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export function isCognitoConfigured(): boolean {
  return Boolean(COGNITO_DOMAIN && CLIENT_ID);
}

export function getRedirectUri(): string {
  return `${window.location.origin}/auth/callback`;
}

function randomString(bytes = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64Url(array);
}

function base64Url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
}

export async function beginGoogleSignIn(): Promise<void> {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito is not configured for this build');
  }
  const verifier = randomString(64);
  const state = randomString(16);
  const challenge = base64Url(await sha256(verifier));
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: getRedirectUri(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    identity_provider: 'Google',
  });
  window.location.assign(`${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`);
}

export async function exchangeCodeForTokens(code: string, state: string): Promise<CognitoTokens> {
  const expectedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  if (!expectedState || expectedState !== state) {
    throw new Error('Invalid OAuth state');
  }
  if (!verifier) {
    throw new Error('Missing PKCE verifier');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  });

  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const tokens: CognitoTokens = {
    accessToken: json.access_token,
    idToken: json.id_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  saveTokens(tokens);
  return tokens;
}

export async function refreshTokens(refreshToken: string): Promise<CognitoTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error('Session expired');
  }
  const json = (await res.json()) as {
    access_token: string;
    id_token: string;
    expires_in: number;
  };
  const tokens: CognitoTokens = {
    accessToken: json.access_token,
    idToken: json.id_token,
    refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  saveTokens(tokens);
  return tokens;
}

export function saveTokens(tokens: CognitoTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function loadTokens(): CognitoTokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CognitoTokens;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;
  if (tokens.expiresAt > Date.now() + 60_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken || !isCognitoConfigured()) {
    clearTokens();
    return null;
  }
  try {
    const next = await refreshTokens(tokens.refreshToken);
    return next.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

export function cognitoLogoutUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: `${window.location.origin}/`,
  });
  return `${COGNITO_DOMAIN}/logout?${params.toString()}`;
}
