import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '~/lib/api';
import { Agent } from '~/lib/schemas';

const AgentListSchema = z.object({ items: z.array(Agent) });

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: ({ signal }) =>
      apiRequest('/agents', { schema: AgentListSchema, signal }),
    select: (d) => d.items,
  });
}
