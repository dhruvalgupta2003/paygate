import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

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

    case 'generate-evm-key': {
      const pk = generatePrivateKey();
      const account = privateKeyToAccount(pk);
      console.log(`address:     ${account.address}`);
      console.log(`private_key: ${pk}`);
      console.log('');
      console.log('# Treat the private key like a password.');
      console.log('# For testnet only: fund this address from');
      console.log('#   https://faucet.quicknode.com/base/sepolia   (gas)');
      console.log('#   https://faucet.circle.com/                  (USDC)');
      return;
    }

    default:
      console.error(`unknown action: ${action}`);
      console.error('available: generate-webhook-secret | generate-admin-keypair | generate-evm-key');
      process.exitCode = 1;
  }
}
