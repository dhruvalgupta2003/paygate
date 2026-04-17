import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '~/lib/api';
import { TransactionPage } from '~/lib/schemas';

export interface TransactionsFilters {
  chain?: string;
  status?: string;
  q?: string;
}

const PAGE_SIZE = 50;

const TransactionPageSchema = z.object({
  items: TransactionPage.shape.items,
  next_cursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});

export function useTransactions(filters: TransactionsFilters) {
  return useInfiniteQuery({
    queryKey: ['transactions', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      apiRequest('/transactions', {
        schema: TransactionPageSchema,
        query: {
          limit: PAGE_SIZE,
          cursor: pageParam ?? null,
          chain: filters.chain ?? null,
          status: filters.status ?? null,
          q: filters.q ?? null,
        },
        signal,
      }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}
