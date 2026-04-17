import { generateKeyPairSync, randomBytes } from 'node:crypto';

export async function runGenerateWebhookSecret(action: string): Promise<void> {
  switch (action) {
    case 'generate-webhook-secret':
      console.log(randomBytes(48).toString('base64'));
      return;
    case 'generate-admin-keypair': {
      const kp = generateKeyPairSync('ed25519', {});
      const pub = kp.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
      const priv = kp.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
      console.log(`public:  ${pub}`);
      console.log(`private: ${priv}`);
      return;
    }
    default:
      console.error(`unknown action: ${action}`);
      process.exitCode = 1;
  }
}
