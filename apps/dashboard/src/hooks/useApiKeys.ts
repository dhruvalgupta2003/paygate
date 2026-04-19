import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '~/lib/api';
import { ApiKey, ApiKeyCreated } from '~/lib/schemas';

const KeyListSchema = z.object({ items: z.array(ApiKey) });
const RevokeSchema = z.unknown();

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: ({ signal }) => apiRequest('/keys', { schema: KeyListSchema, signal }),
    select: (d) => d.items,
  });
}

interface CreateKeyInput {
  name: string;
  role: ApiKey['role'];
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation<ApiKeyCreated, Error, CreateKeyInput>({
    mutationFn: (input) =>
      apiRequest('/keys', {
        schema: ApiKeyCreated,
        method: 'POST',
        body: input,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) =>
      apiRequest(`/keys/${id}`, {
        schema: RevokeSchema,
        method: 'DELETE',
      }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['api-keys'] });
      const prev = qc.getQueryData<{ items: ApiKey[] }>(['api-keys']);
      if (prev) {
        qc.setQueryData<{ items: ApiKey[] }>(['api-keys'], {
          items: prev.items.map((k) =>
            k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _id, context) => {
      const ctx = context as { prev?: { items: ApiKey[] } } | undefined;
      if (ctx?.prev) qc.setQueryData(['api-keys'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}
