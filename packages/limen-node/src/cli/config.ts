import { loadConfigFromFile } from '../config.js';

export interface ConfigOptions {
  readonly config: string;
}

export async function runConfig(action: string, opts: ConfigOptions): Promise<void> {
  switch (action) {
    case 'lint': {
      loadConfigFromFile(opts.config);
      console.log(`${opts.config}: OK`);
      return;
    }
    case 'print': {
      const cfg = loadConfigFromFile(opts.config);
      console.log(JSON.stringify(cfg, null, 2));
      return;
    }
    case 'explain': {
      const cfg = loadConfigFromFile(opts.config);
      console.log(`project: ${cfg.project?.name ?? '(unnamed)'}`);
      console.log(`endpoints: ${cfg.endpoints.length}`);
      for (const ep of cfg.endpoints) {
        console.log(`  ${ep.method?.join(',') ?? 'ANY'}  ${ep.path}  ${ep.price_usdc ?? ep.price?.base_usdc ?? '?'} USDC`);
      }
      console.log(`chain default: ${cfg.defaults.chain}`);
      console.log(`facilitator:   ${cfg.defaults.facilitator}`);
      return;
    }
    case 'migrate':
      console.log('no migrations pending for version 1');
      return;
    default:
      console.error(`unknown action: ${action}`);
      process.exitCode = 1;
  }
}
