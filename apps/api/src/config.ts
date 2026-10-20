export interface AppConfig {
  authMode: 'dev' | 'cognito';
  port: number;
  corsOrigins: string[];
  appOrigin: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
  cognitoRegion: string;
  tablePrefix?: string;
  useMemoryStore: boolean;
  sesFromEmail?: string;
  awsRegion: string;
  devUser: {
    userId: string;
    email: string;
    displayName: string;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const corsOrigins = (env.CORS_ORIGINS ?? env.APP_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    authMode: env.AUTH_MODE === 'cognito' ? 'cognito' : 'dev',
    port: Number(env.PORT ?? 3001),
    corsOrigins,
    appOrigin: env.APP_ORIGIN ?? 'http://localhost:5173',
    cognitoUserPoolId: env.COGNITO_USER_POOL_ID,
    cognitoClientId: env.COGNITO_CLIENT_ID,
    cognitoRegion: env.COGNITO_REGION ?? env.AWS_REGION ?? 'us-east-1',
    tablePrefix: env.TABLE_PREFIX,
    useMemoryStore: !env.TABLE_PREFIX,
    sesFromEmail: env.SES_FROM_EMAIL,
    awsRegion: env.AWS_REGION ?? 'us-east-1',
    devUser: {
      userId: env.DEV_USER_ID ?? 'user_dev_1',
      email: env.DEV_USER_EMAIL ?? 'dev@example.com',
      displayName: env.DEV_USER_NAME ?? 'Dev User',
    },
  };
}
