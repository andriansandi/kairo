import { z } from "@kairo/types";

export interface PlaneClientOptions {
  baseUrl?: string;
  apiKey: string;
  workspaceSlug: string;
}

export interface PlaneProject {
  id: string;
  identifier: string;
  name: string;
  description: string | null;
  state: string | null;
  priority: string | null;
  startDate: string | null;
  targetDate: string | null;
  archivedAt: string | null;
  workspace: string;
}

export interface PlaneIssue {
  id: string;
  sequenceId: number | null;
  name: string;
  priority: string | null;
  stateGroup: string | null;
  state: string | null;
  startDate: string | null;
  targetDate: string | null;
  assigneeIds: string[];
  labelIds: string[];
  cycleId: string | null;
  point: number | null;
  estimatePoint: number | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaneMember {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  roleSlug: string;
  isActive: boolean;
}

export interface PlaneLabel {
  id: string;
  name: string;
  color: string | null;
}

export interface PlaneCycle {
  id: string;
  name: string;
}

export class PlaneAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "PlaneAPIError";
  }
}

const RawProjectSchema = z
  .object({
    id: z.string(),
    identifier: z.string().catch(""),
    name: z.string().catch(""),
    description: z.string().nullable().catch(null),
    state: z.string().nullable().catch(null),
    priority: z.string().nullable().catch(null),
    start_date: z.string().nullable().catch(null),
    target_date: z.string().nullable().catch(null),
    archived_at: z.string().nullable().catch(null),
    workspace: z.string().catch(""),
  })
  .passthrough();

const RawIssueSchema = z
  .object({
    id: z.string(),
    sequence_id: z.number().nullable().catch(null),
    name: z.string().catch(""),
    priority: z.string().nullable().catch(null),
    state_group: z.string().nullable().catch(null),
    state: z.string().nullable().catch(null),
    start_date: z.string().nullable().catch(null),
    target_date: z.string().nullable().catch(null),
    assignees: z.array(z.string()).default([]),
    labels: z.array(z.string()).default([]),
    cycle_id: z.string().nullable().catch(null),
    point: z.number().nullable().catch(null),
    estimate_point: z.number().nullable().catch(null),
    project: z.string().catch(""),
    created_at: z.string().catch(""),
    updated_at: z.string().catch(""),
  })
  .passthrough();

const RawMemberSchema = z
  .object({
    id: z.string(),
    first_name: z.string().catch(""),
    last_name: z.string().catch(""),
    display_name: z.string().catch(""),
    email: z.string().nullable().catch(null),
    role_slug: z.string().catch(""),
    is_active: z.boolean().catch(true),
  })
  .passthrough();

const RawLabelSchema = z
  .object({
    id: z.string(),
    name: z.string().catch(""),
    color: z.string().nullable().catch(null),
  })
  .passthrough();

const RawCycleSchema = z
  .object({
    id: z.string(),
    name: z.string().catch(""),
  })
  .passthrough();

const EnvelopeSchema = z
  .object({
    total_count: z.number().default(0),
    count: z.number().default(0),
    next_cursor: z.string().nullable().default(null),
    next_page_results: z.boolean().default(false),
    total_pages: z.number().default(1),
    results: z.unknown().array().default([]),
  })
  .passthrough()
  .catch({
    total_count: 0,
    count: 0,
    next_cursor: null,
    next_page_results: false,
    total_pages: 1,
    results: [],
  });

function normalizeProject(raw: unknown): PlaneProject {
  const p = RawProjectSchema.parse(raw);
  return {
    id: p.id,
    identifier: p.identifier,
    name: p.name,
    description: p.description,
    state: p.state,
    priority: p.priority,
    startDate: p.start_date,
    targetDate: p.target_date,
    archivedAt: p.archived_at,
    workspace: p.workspace,
  };
}

function normalizeIssue(raw: unknown): PlaneIssue {
  const i = RawIssueSchema.parse(raw);
  return {
    id: i.id,
    sequenceId: i.sequence_id,
    name: i.name,
    priority: i.priority,
    stateGroup: i.state_group,
    state: i.state,
    startDate: i.start_date,
    targetDate: i.target_date,
    assigneeIds: i.assignees,
    labelIds: i.labels,
    cycleId: i.cycle_id,
    point: i.point,
    estimatePoint: i.estimate_point,
    projectId: i.project,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}

function normalizeMember(raw: unknown): PlaneMember {
  const m = RawMemberSchema.parse(raw);
  return {
    id: m.id,
    firstName: m.first_name,
    lastName: m.last_name,
    displayName: m.display_name,
    email: m.email,
    roleSlug: m.role_slug,
    isActive: m.is_active,
  };
}

function normalizeLabel(raw: unknown): PlaneLabel {
  const l = RawLabelSchema.parse(raw);
  return { id: l.id, name: l.name, color: l.color };
}

function normalizeCycle(raw: unknown): PlaneCycle {
  const c = RawCycleSchema.parse(raw);
  return { id: c.id, name: c.name };
}

const MAX_RETRIES = 3;
const DEFAULT_BASE_URL = "https://api.plane.so";
const DEFAULT_PAGE_SIZE = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PlaneClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly workspaceSlug: string;

  constructor(options: PlaneClientOptions) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.workspaceSlug = options.workspaceSlug;
  }

  private async fetchWithRetry(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers);
    headers.set("X-API-Key", this.apiKey);
    headers.set("Accept", "application/json");
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let response: Response | undefined;
      try {
        response = await fetch(url, { ...init, headers });
      } catch (err) {
        lastError =
          err instanceof Error ? err : new Error("Network error", { cause: err });
        await sleep(2 ** attempt * 500);
        continue;
      }

      if (response.ok) {
        return response;
      }

      const body = await response.text().catch(() => "");
      if (response.status === 429 || response.status >= 500) {
        lastError = new PlaneAPIError(
          `Plane API ${response.status}`,
          response.status,
          body,
        );
        await sleep(2 ** attempt * 500);
        continue;
      }

      throw new PlaneAPIError(
        `Plane API ${response.status}: ${body.slice(0, 200)}`,
        response.status,
        body,
      );
    }

    const cause = lastError ?? new Error("Unknown error");
    throw new PlaneAPIError(
      `Plane API request failed after ${MAX_RETRIES} attempts: ${cause.message}`,
      cause instanceof PlaneAPIError ? cause.status : 0,
      cause instanceof PlaneAPIError ? cause.body : "",
    );
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await this.fetchWithRetry(path);
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new PlaneAPIError(
        "Plane API returned invalid JSON",
        response.status,
        text.slice(0, 500),
      );
    }
  }

  private projectPath(path: string): string {
    return `/api/v1/workspaces/${encodeURIComponent(this.workspaceSlug)}/projects${path}`;
  }

  private async *paginated<T>(
    makePath: (cursor: string | null) => string,
    normalize: (raw: unknown) => T,
  ): AsyncGenerator<T, void, unknown> {
    let cursor: string | null = null;
    do {
      const page = await this.fetchJson<unknown>(makePath(cursor));
      const envelope = EnvelopeSchema.parse(page);
      for (const raw of envelope.results) {
        try {
          yield normalize(raw);
        } catch {
          // Drop malformed rows; pagination continues.
        }
      }
      cursor = envelope.next_page_results ? envelope.next_cursor : null;
    } while (cursor);
  }

  async listProjects(): Promise<PlaneProject[]> {
    const items: PlaneProject[] = [];
    for await (const project of this.paginated(
      (cursor) =>
        `${this.projectPath("/")}?per_page=${DEFAULT_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      normalizeProject,
    )) {
      items.push(project);
    }
    return items;
  }

  async listIssues(projectId: string): Promise<PlaneIssue[]> {
    const items: PlaneIssue[] = [];
    for await (const issue of this.paginated(
      (cursor) =>
        `${this.projectPath(`/${encodeURIComponent(projectId)}/issues/`)}?per_page=${DEFAULT_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      normalizeIssue,
    )) {
      items.push(issue);
    }
    return items;
  }

  async listMembers(): Promise<PlaneMember[]> {
    const path = `/api/v1/workspaces/${encodeURIComponent(this.workspaceSlug)}/members/`;
    const body = await this.fetchJson<unknown>(path);
    const list = z.unknown().array().catch([]).parse(body);
    const members: PlaneMember[] = [];
    for (const raw of list) {
      try {
        members.push(normalizeMember(raw));
      } catch {
        // Skip malformed members.
      }
    }
    return members;
  }

  async listLabels(projectId: string): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    for await (const label of this.paginated(
      (cursor) =>
        `${this.projectPath(`/${encodeURIComponent(projectId)}/labels/`)}?per_page=${DEFAULT_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      (raw) => {
        const l = normalizeLabel(raw);
        map[l.id] = l.name;
        return l;
      },
    )) {
      void label;
    }
    return map;
  }

  async listCycles(projectId: string): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    for await (const cycle of this.paginated(
      (cursor) =>
        `${this.projectPath(`/${encodeURIComponent(projectId)}/cycles/`)}?per_page=${DEFAULT_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      (raw) => {
        const c = normalizeCycle(raw);
        map[c.id] = c.name;
        return c;
      },
    )) {
      void cycle;
    }
    return map;
  }
}
