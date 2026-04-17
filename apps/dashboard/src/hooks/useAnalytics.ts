import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '~/lib/api';
import { AnalyticsSummary, Timeseries } from '~/lib/schemas';
import type { TimeRange } from '~/lib/time';

export function useAnalyticsSummary(range: TimeRange) {
  return useQuery({
    queryKey: ['analytics', 'summary', range],
    queryFn: ({ signal }) =>
      apiRequest('/analytics/summary', {
        schema: AnalyticsSummary,
        query: { range },
        signal,
      }),
  });
}

export function useRevenueTimeseries(range: TimeRange) {
  return useQuery({
    queryKey: ['analytics', 'timeseries', 'revenue', range],
    queryFn: ({ signal }) =>
      apiRequest('/analytics/timeseries', {
        schema: Timeseries,
        query: { metric: 'revenue_usdc', range },
        signal,
      }),
  });
}

export function useRequestsTimeseries(range: TimeRange) {
  return useQuery({
    queryKey: ['analytics', 'timeseries', 'requests', range],
    queryFn: ({ signal }) =>
      apiRequest('/analytics/timeseries', {
        schema: Timeseries,
        query: { metric: 'requests_total', range },
        signal,
      }),
  });
}
