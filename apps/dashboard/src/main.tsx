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
  // MSW mocks only fire when VITE_USE_MSW=true.  Once the real API is up,
  // set VITE_USE_MSW=false (or unset it) so requests hit localhost:4020.
  const useMsw = import.meta.env['VITE_USE_MSW'] === 'true';
  if (useMsw && import.meta.env.DEV) {
    try {
      const { worker } = await import('./mocks/browser');
      await worker.start({ onUnhandledRequest: 'bypass' });
      console.info('[limen] MSW mocking enabled');
    } catch (err) {
      console.warn(
        '[limen] MSW could not start (continuing without mocks).',
        err,
      );
    }
  } else {
    console.info(
      `[limen] live API mode (VITE_API_URL=${import.meta.env['VITE_API_URL'] ?? 'http://localhost:4020'})`,
    );
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
