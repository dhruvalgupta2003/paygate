import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '~/lib/api';
import { BillingPortalLink, BillingState } from '~/lib/schemas';

export function useBilling() {
  return useQuery({
    queryKey: ['billing'],
    queryFn: ({ signal }) => apiRequest('/billing', { schema: BillingState, signal }),
  });
}

const SetCustomerResp = z.object({ stripe_customer_id: z.string() });

interface SetCustomerInput {
  /** Optional pre-existing Stripe customer (cus_…); when omitted the API mints one. */
  stripe_customer_id?: string;
  email?: string;
}

export function useSetBillingCustomer() {
  const qc = useQueryClient();
  return useMutation<{ stripe_customer_id: string }, Error, SetCustomerInput>({
    mutationFn: (input) =>
      apiRequest('/billing/customer', {
        schema: SetCustomerResp,
        method: 'POST',
        body: input,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  });
}

export function useUnlinkBillingCustomer() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: () =>
      apiRequest('/billing/customer', {
        schema: z.unknown(),
        method: 'DELETE',
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  });
}

export function useOpenBillingPortal() {
  return useMutation<BillingPortalLink, Error, void>({
    mutationFn: () =>
      apiRequest('/billing/portal', { schema: BillingPortalLink, method: 'POST' }),
  });
}
