export interface PaginationParams {
  page: number;
  limit: number;
}

const MAX_LIMIT = 100;

export function strParam(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }
  return undefined;
}

export function parsePagination(query: {
  page?: string;
  limit?: string;
}): PaginationParams {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit ?? '20', 10) || 20),
  );
  return { page, limit };
}

export function parseSort<T extends string>(
  query: { sortBy?: string; sortOrder?: string },
  allowlist: readonly T[],
  fallback: T,
): { sortBy: T; sortOrder: 1 | -1 } {
  const sortBy = (allowlist as readonly string[]).includes(query.sortBy ?? '')
    ? (query.sortBy as T)
    : fallback;
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  return { sortBy, sortOrder };
}

export function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

export function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
