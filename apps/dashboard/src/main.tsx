import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { queryClient } from './lib/query-client';
import './styles/globals.css';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: { queryClient },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

async function bootstrap() {
  // Start MSW if available, but never let its failure block the UI.
  if (import.meta.env.DEV) {
    try {
      const { worker } = await import('./mocks/browser');
      await worker.start({ onUnhandledRequest: 'bypass' });
      console.info('[paygate] MSW mocking enabled');
    } catch (err) {
      console.warn(
        '[paygate] MSW could not start (continuing without mocks). ' +
          'Run `pnpm --filter @paygate/dashboard exec msw init public/ --save` ' +
          'to generate mockServiceWorker.js.',
        err,
      );
    }
  }

  const el = document.getElementById('root');
  if (!el) throw new Error('#root missing');

  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
