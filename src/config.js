import 'dotenv/config';

function asBoolean(value, defaultValue = false) {
  if (value === undefined || value === '') return defaultValue;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function asInteger(value, defaultValue) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const config = {
  nodeEnv,
  isProduction,
  port: asInteger(process.env.PORT, 3000),
  logLevel: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  requestTimeoutMs: asInteger(process.env.REQUEST_TIMEOUT_MS, 30000),
  shutdownTimeoutMs: asInteger(process.env.SHUTDOWN_TIMEOUT_MS, 15000),
  trustProxy: asInteger(process.env.TRUST_PROXY, 1),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  privacyPolicyUrl: process.env.PRIVACY_POLICY_URL || '/privacy.html',

  databaseUrl: process.env.DATABASE_URL || '',
  dbSsl: asBoolean(process.env.DB_SSL, false),
  dbSslRejectUnauthorized: asBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, true),
  dbPoolMax: asInteger(process.env.DB_POOL_MAX, 10),
  dbStatementTimeoutMs: asInteger(process.env.DB_STATEMENT_TIMEOUT_MS, 15000),
  dbIdleTransactionTimeoutMs: asInteger(process.env.DB_IDLE_TRANSACTION_TIMEOUT_MS, 15000),
  postgresRequiredMajor: asInteger(process.env.POSTGRES_REQUIRED_MAJOR, 18),

  uploadDir: process.env.UPLOAD_DIR || '/app/uploads',
  maxUploadFiles: asInteger(process.env.MAX_UPLOAD_FILES, 5),
  maxUploadMb: asInteger(process.env.MAX_UPLOAD_MB, 8),
  maxImageDimension: asInteger(process.env.MAX_IMAGE_DIMENSION, 1920),
  jpegQuality: asInteger(process.env.JPEG_QUALITY, 85),

  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',

  // Render environment variables are case-sensitive.
  // Prefer LIFF_ID, while keeping liffId as a compatibility fallback.
  liffId: (process.env.LIFF_ID || process.env.liffId || '').trim(),
  lineLoginChannelId: process.env.LINE_LOGIN_CHANNEL_ID || '',
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  devBypassLineAuth:
    !isProduction && asBoolean(process.env.DEV_BYPASS_LINE_AUTH, false),
};

const requiredInAllEnvironments = ['databaseUrl'];
const requiredInProduction = [
  'liffId',
  'lineLoginChannelId',
  'lineChannelSecret',
  'lineChannelAccessToken',
  'jwtSecret',
];

for (const key of requiredInAllEnvironments) {
  if (!config[key]) {
    throw new Error(`Missing required configuration: ${key}`);
  }
}

if (config.maxUploadFiles < 1 || config.maxUploadFiles > 10) {
  throw new Error('MAX_UPLOAD_FILES must be between 1 and 10');
}

if (config.maxUploadMb < 1 || config.maxUploadMb > 20) {
  throw new Error('MAX_UPLOAD_MB must be between 1 and 20');
}

if (isProduction) {
  for (const key of requiredInProduction) {
    if (!config[key]) {
      const envName = key === 'liffId' ? 'LIFF_ID' : key;
      throw new Error(
        `Missing required production configuration: ${key} (set ${envName} in Render Environment)`,
      );
    }
  }

  if (config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters in production');
  }

  if (config.devBypassLineAuth) {
    throw new Error('DEV_BYPASS_LINE_AUTH cannot be enabled in production');
  }
}

export default config;
