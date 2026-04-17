import { createLogger } from '../lib/logger.js';

// Nightly shipper that tar.gz's the audit log into S3 / GCS.  The wiring to
// AWS / GCP clients lives in services/evidence-service.ts; this is the
// crontab entry point.

export async function runAuditShipper(): Promise<void> {
  const log = createLogger().child({ worker: 'audit-shipper' });
  log.info({}, 'audit shipper started');
  // TODO(services/evidence-service): iterate audit_log partitions older
  // than the retention window and push a compressed dump to the operator's
  // object store.  Verify hash chain before shipping.
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runAuditShipper();
}
