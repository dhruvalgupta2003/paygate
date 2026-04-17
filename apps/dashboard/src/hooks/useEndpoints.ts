import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '~/lib/api';
import { Endpoint } from '~/lib/schemas';

const EndpointListSchema = z.object({ items: z.array(Endpoint) });
const EndpointSchema = Endpoint;

export function useEndpoints() {
  return useQuery({
    queryKey: ['endpoints'],
    queryFn: ({ signal }) =>
      apiRequest('/endpoints', { schema: EndpointListSchema, signal }),
    select: (d) => d.items,
  });
}

interface UpdateEndpointPatch {
  id: string;
  price_usdc_micros?: string;
  enabled?: boolean;
}

export function useUpdateEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateEndpointPatch) =>
      apiRequest(`/endpoints/${id}`, {
        schema: EndpointSchema,
        method: 'PATCH',
        body: patch,
      }),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ['endpoints'] });
      const prev = qc.getQueryData<{ items: Endpoint[] }>(['endpoints']);
      if (prev) {
        qc.setQueryData<{ items: Endpoint[] }>(['endpoints'], {
          items: prev.items.map((e) =>
            e.id === id ? { ...e, ...patch } : e,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        qc.setQueryData(['endpoints'], context.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['endpoints'] });
    },
  });
}
