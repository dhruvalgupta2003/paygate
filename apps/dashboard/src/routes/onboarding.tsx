import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';

export const Route = createFileRoute('/onboarding')({
  component: OnboardingRoute,
});

function OnboardingRoute() {
  const [step, setStep] = useState(0);
  return (
    <>
      <PageHeader title="Onboarding" description="Three steps. You'll earn your first USDC by the end." />

      <ol className="mb-8 flex items-center gap-3 text-xs uppercase tracking-widest text-ink-500">
        {['Connect wallet', 'Choose chain', 'Set prices'].map((label, i) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 ${i === step ? 'bg-indigo-600 text-white' : 'bg-ink-100 dark:bg-ink-800'}`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-ink-200 bg-cloud p-8 dark:border-ink-800 dark:bg-ink-900">
        {step === 0 && <ConnectWallet />}
        {step === 1 && <ChooseChain />}
        {step === 2 && <SetPrices />}
        <div className="mt-6 flex justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </Button>
          <Button variant="primary" onClick={() => setStep((s) => Math.min(2, s + 1))}>
            {step === 2 ? 'Finish' : 'Continue'}
          </Button>
        </div>
      </div>
    </>
  );
}

function ConnectWallet() {
  return (
    <div>
      <h3 className="text-lg font-semibold">Connect a receiving wallet</h3>
      <p className="mt-1 text-sm text-ink-500">PayGate never sees private keys — only the public address USDC is sent to.</p>
    </div>
  );
}

function ChooseChain() {
  return (
    <div>
      <h3 className="text-lg font-semibold">Pick one or more chains</h3>
      <p className="mt-1 text-sm text-ink-500">Base for cheap + fast. Solana for sub-cent payments. You can enable both.</p>
    </div>
  );
}

function SetPrices() {
  return (
    <div>
      <h3 className="text-lg font-semibold">Set your prices</h3>
      <p className="mt-1 text-sm text-ink-500">Start with $0.001. You can raise or lower per endpoint later.</p>
    </div>
  );
}
