import { Hono } from 'hono';

// Streams a ZIP of SOC 2 evidence — wiring to real services lives in
// services/evidence-service.ts.  This route is the public contract.
export const evidenceRoutes = new Hono().get('/pack', (c) => {
  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', 'attachment; filename="limen-evidence.zip"');
  // Empty ZIP for now (PK\x05\x06 end-of-central-directory marker);
  // service layer will fill this with real entries.
  const emptyZip = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  return c.body(emptyZip);
});
