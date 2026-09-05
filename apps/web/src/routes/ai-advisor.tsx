import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './layout';
import Placeholder from './placeholder';

export const aiAdvisorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ai-advisor',
  component: () => <Placeholder title="AI Advisor" />,
});
