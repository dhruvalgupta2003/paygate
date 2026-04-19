import { USDC_DECIMALS } from '../constants.js';

/**
 * USDC amounts are strings of "micros" (6 decimal places).
 * We never use floats for money.
 */

const TEN_POW_USDC = 10n ** BigInt(USDC_DECIMALS);

export function usdcToMicros(usdc: string): bigint {
  const s = usdc.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) {
    throw new Error(`invalid USDC amount: ${JSON.stringify(usdc)}`);
  }
  const [wholeRaw, fracRaw = ''] = s.split('.');
  const whole = BigInt(wholeRaw ?? '0');
  const frac = BigInt((fracRaw + '000000').slice(0, USDC_DECIMALS));
  return whole * TEN_POW_USDC + frac;
}

export function microsToUsdc(micros: bigint): string {
  const abs = micros < 0n ? -micros : micros;
  const whole = abs / TEN_POW_USDC;
  const frac = abs % TEN_POW_USDC;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0');
  return `${micros < 0n ? '-' : ''}${whole.toString()}.${fracStr}`;
}

export function bigintMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function bigintMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}
