import { Outlet, createRootRoute } from '@tanstack/react-router';
import { AppLayout } from '../layouts/AppLayout';

export const Route = createRootRoute({
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});
