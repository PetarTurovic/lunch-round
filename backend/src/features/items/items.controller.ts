import type { QueryFilter } from 'mongoose';
import type { Request, Response } from 'express';
import { NotFoundError } from '../../shared/errors';
import { Item } from './items.model';
import type { ItemDocument } from './items.model';
import type { ItemFiltersInput, ItemListResponse } from './items.types';

// --- query param helpers (inlined; shared/pagination.ts removed) ---
const MAX_LIMIT = 100;

function strParam(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }
  return undefined;
}

function parsePagination(query: {
  page?: string;
  limit?: string;
}): { page: number; limit: number } {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit ?? '20', 10) || 20),
  );
  return { page, limit };
}

function parseSort<T extends string>(
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

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const SORTABLE_FIELDS = [
  'name',
  'price',
  'storeId',
  'sectionTitle',
  'createdAt',
] as const;

export const listItems = async (req: Request, res: Response) => {
  const query: ItemFiltersInput = {
    storeId: strParam(req.query.storeId),
    sectionTitle: strParam(req.query.sectionTitle),
    sections: strParam(req.query.sections)?.split(',').map((s) => s.trim()),
    search: strParam(req.query.search),
    minPrice: parseNumber(strParam(req.query.minPrice)),
    maxPrice: parseNumber(strParam(req.query.maxPrice)),
    currency: strParam(req.query.currency),
    isSoldOut: parseBoolean(strParam(req.query.isSoldOut)),
    hasOptions: parseBoolean(strParam(req.query.hasOptions)),
  };

  const filter: QueryFilter<ItemDocument> = {};
  if (query.storeId) filter.storeId = query.storeId;
  if (query.sectionTitle) filter.sectionTitle = query.sectionTitle;
  if (query.sections && query.sections.length > 0) {
    filter.sections = { $in: query.sections };
  }
  if (query.currency) filter.currency = query.currency;
  if (query.isSoldOut !== undefined) filter.isSoldOut = query.isSoldOut;
  if (query.hasOptions !== undefined) filter.hasOptions = query.hasOptions;
  if (query.search) filter.name = { $regex: query.search, $options: 'i' };
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const price: Record<string, number> = {};
    if (query.minPrice !== undefined) price.$gte = query.minPrice;
    if (query.maxPrice !== undefined) price.$lte = query.maxPrice;
    (filter as Record<string, unknown>).price = price;
  }

  const pagination = parsePagination({
    page: strParam(req.query.page),
    limit: strParam(req.query.limit),
  });
  const sort = parseSort(
    {
      sortBy: strParam(req.query.sortBy),
      sortOrder: strParam(req.query.sortOrder),
    },
    SORTABLE_FIELDS,
    'createdAt',
  );

  const result = await Item.paginate(filter, {
    page: pagination.page,
    limit: pagination.limit,
    sort: { [sort.sortBy]: sort.sortOrder },
    lean: true,
  });

  const response: ItemListResponse = {
    items: result.docs as unknown as ItemListResponse['items'],
    pagination: {
      page: result.page ?? pagination.page,
      limit: result.limit,
      total: result.totalDocs,
      totalPages: result.totalPages,
    },
  };
  res.json(response);
};

export const getItem = async (req: Request, res: Response) => {
  const item = await Item.findById(strParam(req.params.id) ?? '').lean();

  if (!item) {
    throw new NotFoundError('Item');
  }
  res.json(item);
};
