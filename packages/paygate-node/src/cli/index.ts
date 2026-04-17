#!/usr/bin/env node
import { Command } from 'commander';
import { PAYGATE_VERSION } from '../constants.js';
import { startServer } from './start.js';
import { runDoctor } from './doctor.js';
import { runVerify } from './verify.js';
import { runGenerateWebhookSecret } from './keys.js';
import { runConfig } from './config.js';
import { runAudit } from './audit.js';
import { runDemo } from './demo.js';

const program = new Command();
program
  .name('paygate')
  .description('PayGate CLI — x402 paywall for agent traffic.')
  .version(PAYGATE_VERSION);

program
  .command('start')
  .description('Run the proxy.')
  .option('-c, --config <path>', 'path to paygate.config.yml', './paygate.config.yml')
  .option('-u, --upstream <url>', 'upstream URL to proxy to', process.env['PAYGATE_UPSTREAM_URL'])
  .option('-p, --port <port>', 'listen port', '4021')
  .option('-H, --host <host>', 'listen host', '0.0.0.0')
  .option('--dev', 'enable dev mode (skip on-chain verify)')
  .option('--trace', 'enable request tracing')
  .option('--dry-run', 'validate config and exit')
  .action(async (opts) => {
    await startServer(opts);
  });

program
  .command('doctor')
  .description('Check config + connectivity + ports.')
  .option('-c, --config <path>', 'path to paygate.config.yml', './paygate.config.yml')
  .action(async (opts) => {
    const ok = await runDoctor(opts);
    process.exit(ok ? 0 : 1);
  });

program
  .command('verify')
  .description('Verify a transaction against config.')
  .requiredOption('--chain <chain>', 'base | base-sepolia | solana | solana-devnet')
  .requiredOption('--tx <hash>', 'transaction hash or Solana signature')
  .option('--expected-amount <usdc>', 'required amount in USDC (e.g. 0.001)')
  .option('--expected-to <address>', 'expected receiver wallet')
  .action(async (opts) => {
    await runVerify(opts);
  });

program
  .command('config')
  .description('Configuration helpers.')
  .argument('<action>', 'lint | print | explain | migrate')
  .option('-c, --config <path>', 'path to paygate.config.yml', './paygate.config.yml')
  .action(async (action: string, opts) => {
    await runConfig(action, opts);
  });

program
  .command('keys')
  .description('Key utilities.')
  .argument('<action>', 'generate-webhook-secret | generate-admin-keypair')
  .action(async (action: string) => {
    await runGenerateWebhookSecret(action);
  });

program
  .command('audit')
  .description('Audit log utilities.')
  .argument('<action>', 'verify | tail | pack')
  .option('--file <path>', 'audit log file path')
  .action(async (action: string, opts) => {
    await runAudit(action, opts);
  });

program
  .command('demo')
  .description('Drive a full x402 handshake against a running proxy.')
  .option('--upstream <url>', 'proxy URL', 'http://localhost:4021')
  .option('--endpoint <path>', 'endpoint to hit', '/api/v1/weather/sf')
  .option('--chain <chain>', 'base | base-sepolia', 'base-sepolia')
  .option('--private-key <hex>', '0x... private key (throwaway ok; generated if omitted)')
  .option('-v, --verbose', 'verbose output')
  .action(async (opts) => {
    await runDemo({
      upstream: opts.upstream,
      endpoint: opts.endpoint,
      chain: opts.chain,
      ...(opts.privateKey ? { privateKey: opts.privateKey } : {}),
      verbose: opts.verbose === true,
    });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(`paygate: ${(err as Error).message}`);
  process.exit(1);
});
