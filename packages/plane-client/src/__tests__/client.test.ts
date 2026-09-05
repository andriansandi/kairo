import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlaneClient, PlaneAPIError } from "../index";

describe("PlaneClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function envelopeBody(results: unknown[], next = false, cursor: string | null = null) {
    return {
      total_count: results.length,
      count: results.length,
      next_cursor: cursor,
      next_page_results: next,
      total_pages: 1,
      results,
    };
  }

  function okEnvelope(results: unknown[], next = false, cursor: string | null = null) {
    const body = envelopeBody(results, next, cursor);
    return {
      status: 200,
      ok: true,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }

  it("sends X-API-Key header", async () => {
    fetchSpy.mockResolvedValueOnce(
      okEnvelope([{ id: "p1", identifier: "P1", name: "Project 1" }]),
    );

    const client = new PlaneClient({
      apiKey: "secret-key",
      workspaceSlug: "ws",
      baseUrl: "https://api.test",
    });
    await client.listProjects();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const request = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((request.headers as Headers).get("X-API-Key")).toBe("secret-key");
  });

  it("loops through paginated project results", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        okEnvelope([{ id: "p1", identifier: "P1", name: "One" }], true, "c1"),
      )
      .mockResolvedValueOnce(
        okEnvelope([{ id: "p2", identifier: "P2", name: "Two" }], false, null),
      );

    const client = new PlaneClient({
      apiKey: "k",
      workspaceSlug: "ws",
      baseUrl: "https://api.test",
    });
    const projects = await client.listProjects();

    expect(projects).toHaveLength(2);
    expect(projects[0].id).toBe("p1");
    expect(projects[1].name).toBe("Two");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondUrl = fetchSpy.mock.calls[1][0] as string;
    expect(secondUrl).toContain("cursor=c1");
  });

  it("retries 429 with exponential backoff", async () => {
    const ok = okEnvelope([{ id: "p1", identifier: "P1", name: "Project 1" }]);
    fetchSpy
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        text: async () => "rate limited",
      } as unknown as Response)
      .mockResolvedValueOnce({
        status: 500,
        ok: false,
        text: async () => "server error",
      } as unknown as Response)
      .mockResolvedValueOnce(ok);

    const client = new PlaneClient({
      apiKey: "k",
      workspaceSlug: "ws",
      baseUrl: "https://api.test",
    });
    const projects = await client.listProjects();
    expect(projects).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("throws after 3 failed retries", async () => {
    fetchSpy.mockResolvedValue({
      status: 503,
      ok: false,
      text: async () => "down",
    } as unknown as Response);

    const client = new PlaneClient({
      apiKey: "k",
      workspaceSlug: "ws",
      baseUrl: "https://api.test",
    });
    await expect(client.listProjects()).rejects.toBeInstanceOf(PlaneAPIError);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("normalizes members returned as an array", async () => {
    const members = [
      {
        id: "m1",
        first_name: "Ada",
        last_name: "Lovelace",
        display_name: "ada",
        email: "ada@example.com",
        role_slug: "admin",
        is_active: true,
      },
    ];
    fetchSpy.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => members,
      text: async () => JSON.stringify(members),
    } as unknown as Response);

    const client = new PlaneClient({
      apiKey: "k",
      workspaceSlug: "ws",
      baseUrl: "https://api.test",
    });
    const resultMembers = await client.listMembers();
    expect(resultMembers).toHaveLength(1);
    expect(resultMembers[0].email).toBe("ada@example.com");
  });
});
