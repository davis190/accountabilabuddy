import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Context, Next } from 'hono';
import type { AppConfig } from './config.js';
import { unauthorized } from './errors.js';

export interface AuthUser {
  userId: string;
  email?: string;
  name?: string;
}

export type AppVariables = {
  user: AuthUser;
  requestId: string;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(config: AppConfig) {
  if (!config.cognitoUserPoolId) {
    throw unauthorized('Cognito is not configured');
  }
  if (!jwks) {
    const url = new URL(
      `https://cognito-idp.${config.cognitoRegion}.amazonaws.com/${config.cognitoUserPoolId}/.well-known/jwks.json`,
    );
    jwks = createRemoteJWKSet(url);
  }
  return jwks;
}

export async function resolveAuthUser(
  authorization: string | undefined,
  config: AppConfig,
): Promise<AuthUser> {
  if (config.authMode === 'dev') {
    if (authorization?.startsWith('Bearer dev:')) {
      const payload = authorization.slice('Bearer dev:'.length);
      const [userId, email, name] = payload.split('|');
      return {
        userId: userId || config.devUser.userId,
        email: email || config.devUser.email,
        name: name || config.devUser.displayName,
      };
    }
    return { ...config.devUser, name: config.devUser.displayName };
  }

  if (!authorization?.startsWith('Bearer ')) {
    throw unauthorized();
  }
  const token = authorization.slice('Bearer '.length);
  if (!config.cognitoUserPoolId || !config.cognitoClientId) {
    throw unauthorized('Cognito is not configured');
  }

  const issuer = `https://cognito-idp.${config.cognitoRegion}.amazonaws.com/${config.cognitoUserPoolId}`;
  const { payload } = await jwtVerify(token, getJwks(config), {
    issuer,
    audience: config.cognitoClientId,
  });

  const userId = payload.sub;
  if (!userId) throw unauthorized('Invalid token subject');

  return {
    userId,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}

export function createAuthMiddleware(config: AppConfig) {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const user = await resolveAuthUser(c.req.header('authorization'), config);
    c.set('user', user);
    await next();
  };
}
