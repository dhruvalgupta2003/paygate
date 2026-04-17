/**
 * Protected route — reaches this handler only after PayGate middleware has
 * verified + settled a $0.001 USDC payment on Base Sepolia.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface PremiumPayload {
  readonly message: string;
  readonly served_at: string;
  readonly tier: 'paid';
}

export async function GET(): Promise<NextResponse<PremiumPayload>> {
  const payload: PremiumPayload = {
    message: 'Welcome to the premium endpoint.',
    served_at: new Date().toISOString(),
    tier: 'paid',
  };
  return NextResponse.json(payload);
}

export async function POST(request: Request): Promise<NextResponse> {
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // TODO(premium-handler): run real business logic here.
  return NextResponse.json({
    ok: true,
    echoed_keys: Object.keys(raw),
    tier: 'paid',
  });
}
