export const APP_NAME = 'AI Knowledge Graph';
export const APP_VERSION = '1.0.0';

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
  maxLimit: 100,
} as const;

export const FILE_SIZE_LIMITS = {
  upload: 50 * 1024 * 1024,
  pdf: 100 * 1024 * 1024,
  image: 20 * 1024 * 1024,
} as const;

export const CACHE_TTL = {
  short: 60,
  medium: 300,
  long: 3600,
  day: 86400,
} as const;

export const CHUNK_SIZE = 512;
export const CHUNK_OVERLAP = 64;
export const EMBEDDING_DIMENSION = 1536;
export const MAX_RETRIES = 3;
