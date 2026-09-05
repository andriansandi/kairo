import { createRouter } from '@tanstack/react-router';
import { rootRoute } from './routes/layout';
import { dashboardRoute } from './routes/dashboard';
import { projectsRoute } from './routes/projects';
import { workItemsRoute } from './routes/work-items';
import { peopleRoute } from './routes/people';
import { skillsRoute } from './routes/skills';
import { capacityRoute } from './routes/capacity';
import { conflictsRoute } from './routes/conflicts';
import { scenariosRoute } from './routes/scenarios';
import { aiAdvisorRoute } from './routes/ai-advisor';
import { settingsRoute } from './routes/settings/layout';
import { settingsIndexRoute } from './routes/settings/index';
import { settingsTeamsRoute } from './routes/settings/teams';
import { settingsSyncRoute } from './routes/settings/sync';
import { settingsImportsRoute } from './routes/settings/imports';

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  projectsRoute,
  workItemsRoute,
  peopleRoute,
  skillsRoute,
  capacityRoute,
  conflictsRoute,
  scenariosRoute,
  aiAdvisorRoute,
  settingsRoute.addChildren([
    settingsIndexRoute,
    settingsTeamsRoute,
    settingsSyncRoute,
    settingsImportsRoute,
  ]),
]);

export const router = createRouter({ routeTree });
