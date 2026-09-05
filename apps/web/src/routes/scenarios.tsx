import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './layout';
import Placeholder from './placeholder';

export const scenariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scenarios',
  component: () => <Placeholder title="Scenarios" />,
});
