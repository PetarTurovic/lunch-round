import type { QueryFilter } from 'mongoose';
import type { Request, Response } from 'express';
import { NotFoundError } from '../../shared/errors';
import { MenuSection } from './menu-sections.model';
import type { MenuSectionDocument } from './menu-sections.model';
import type { MenuSectionFiltersInput, MenuSectionListResponse } from './menu-sections.types';

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

const SORTABLE_FIELDS = ['title', 'storeId', 'createdAt'] as const;

export const listMenuSections = async (req: Request, res: Response) => {
  const query: MenuSectionFiltersInput = {
    storeId: strParam(req.query.storeId),
  };

  const filter: QueryFilter<MenuSectionDocument> = {};
  if (query.storeId) filter.storeId = query.storeId;

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
    'title',
  );

  const result = await MenuSection.paginate(filter, {
    page: pagination.page,
    limit: pagination.limit,
    sort: { [sort.sortBy]: sort.sortOrder },
    lean: true,
  });

  const response: MenuSectionListResponse = {
    sections: result.docs as unknown as MenuSectionListResponse['sections'],
    pagination: {
      page: result.page ?? pagination.page,
      limit: result.limit,
      total: result.totalDocs,
      totalPages: result.totalPages,
    },
  };
  res.json(response);
};

export const getMenuSection = async (req: Request, res: Response) => {
  const section = await MenuSection.findById(strParam(req.params.id) ?? '').lean();

  if (!section) {
    throw new NotFoundError('Menu section');
  }
  res.json(section);
};
