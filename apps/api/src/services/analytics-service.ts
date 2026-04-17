export interface TimeseriesPoint {
  t: string;
  v: string;
}

export async function getSummary(range: string) {
  void range;
  return {
    range,
    revenueUsdc: '0.000000',
    requests: 0,
    unique_wallets: 0,
    top_endpoints: [] as Array<{ path: string; requests: number; revenue_usdc: string }>,
  };
}

export async function getTimeseries(metric: string, step: string, range: string) {
  void metric;
  void step;
  void range;
  return { points: [] as TimeseriesPoint[] };
}
