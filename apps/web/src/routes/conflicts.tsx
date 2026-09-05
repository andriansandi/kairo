import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './layout';
import Placeholder from './placeholder';

export const conflictsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conflicts',
  component: () => <Placeholder title="Conflicts" />,
});
