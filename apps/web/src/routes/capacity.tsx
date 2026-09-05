import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './layout';
import Placeholder from './placeholder';

export const capacityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/capacity',
  component: () => <Placeholder title="Capacity" />,
});
