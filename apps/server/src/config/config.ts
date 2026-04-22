import { loadEnv } from './env.js';

export interface Config {
  port: number;
  env: string;
  timezone: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  mysql: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit: number;
  };
  syncS3: {
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    presignedUrlExpirySeconds: number;
    userPrefix: string;
  };
  allowRegistration: boolean;
}

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const env = loadEnv();

  cachedConfig = {
    port: parseInt(env.PORT, 10),
    env: env.NODE_ENV,
    timezone: env.TZ,
    cors: {
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: env.CORS_CREDENTIALS === 'true',
    },
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
    },
    mysql: {
      host: env.MYSQL_HOST,
      port: parseInt(env.MYSQL_PORT, 10),
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      database: env.MYSQL_DATABASE,
      connectionLimit: parseInt(env.MYSQL_CONNECTION_LIMIT, 10),
    },
    syncS3: {
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
      presignedUrlExpirySeconds: parseInt(env.S3_PRESIGNED_URL_EXPIRY_SECONDS, 10),
      userPrefix: env.S3_USER_PREFIX,
    },
    allowRegistration: env.ALLOW_REGISTRATION === 'true',
  };

  return cachedConfig;
}

export function getConfig(): Config {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}
