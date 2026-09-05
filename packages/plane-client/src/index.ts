import { Project } from "@kairo/types";

export const PLANE_ENDPOINTS = {
  projects: "/api/v1/workspaces/:workspace/projects/",
  issues: "/api/v1/workspaces/:workspace/projects/:project/issues/",
  members: "/api/v1/workspaces/:workspace/members/",
} as const;

export interface PlaneClientOptions {
  baseUrl: string;
  apiKey: string;
  workspace: string;
}

export class PlaneClient {
  constructor(private readonly options: PlaneClientOptions) {}

  // TODO(blueprint §3,§15): implement pagination, backoff, normalization.
  async listProjects(): Promise<Project[]> {
    throw new Error("Phase 0 stub: not implemented");
  }

  async listIssues(_projectId: string): Promise<unknown[]> {
    throw new Error("Phase 0 stub: not implemented");
  }

  async listMembers(): Promise<unknown[]> {
    throw new Error("Phase 0 stub: not implemented");
  }
}
