-- Monthly partitions on transactions(observed_at).
-- Create current + next 3 months now; a nightly job should keep us ahead.

DO $$
DECLARE
  month_start DATE := date_trunc('month', NOW())::date;
  i INT;
BEGIN
  FOR i IN 0..3 LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS transactions_%s PARTITION OF transactions
         FOR VALUES FROM (%L) TO (%L);',
      to_char(month_start + (i || ' months')::interval, 'YYYYMM'),
      (month_start + (i || ' months')::interval),
      (month_start + ((i + 1) || ' months')::interval)
    );
  END LOOP;
END $$;
