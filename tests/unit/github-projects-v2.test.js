import { describe, expect, it, vi } from "vitest";

import {
  fetchGitHubProjectReadModel,
  fetchUserGitHubProjects,
  normalizeGitHubProjectItem,
  resolveGitHubProjectForRepositories,
} from "../../lib/github/projects-v2.js";

vi.mock("server-only", () => ({}));

function project(id, repositories, overrides = {}) {
  return {
    id,
    title: id,
    closed: false,
    linkedRepositories: repositories,
    ...overrides,
  };
}

describe("GitHub Projects v2 read model", () => {
  it("resolves exactly one Project by linked repository identity", () => {
    const result = resolveGitHubProjectForRepositories(
      ["OzAvrahami/projectdeck"],
      [project("matching", ["ozavrahami/ProjectDeck"]), project("other", ["OzAvrahami/LifeOS"])],
    );

    expect(result).toMatchObject({ status: "resolved", project: { id: "matching" } });
  });

  it("supports an exact multi-repository product match", () => {
    const result = resolveGitHubProjectForRepositories(
      ["OzAvrahami/limitpact-website", "OzAvrahami/limitpact-desktop"],
      [project("limitpact", ["OzAvrahami/limitpact-desktop", "OzAvrahami/limitpact-website"])],
    );

    expect(result.status).toBe("resolved");
  });

  it("resolves a private multi-repository Product from stable visible identity and association count", () => {
    const result = resolveGitHubProjectForRepositories(
      [
        { externalId: "1334498331", fullName: "OzAvrahami/limitpact-desktop" },
        { externalId: "1335366662", fullName: "OzAvrahami/limitpact-website" },
      ],
      [
        project(
          "limitpact",
          [
            {
              databaseId: "1335366662",
              nodeId: "R_website",
              fullName: "OzAvrahami/limitpact-website",
            },
          ],
          { linkedRepositoryCount: 2, inaccessibleRepositoryCount: 1 },
        ),
      ],
    );

    expect(result).toMatchObject({
      status: "resolved",
      reason: "repository_set_with_partial_visibility",
      repositoryVisibility: "partial",
      project: { id: "limitpact" },
    });
  });

  it("keeps inaccessible repository candidates ambiguous when identity is not unique", () => {
    const connected = [
      { externalId: "1", fullName: "owner/public" },
      { externalId: "2", fullName: "owner/private" },
    ];
    const candidate = (id) =>
      project(
        id,
        [{ databaseId: "1", fullName: "owner/public" }],
        { linkedRepositoryCount: 2 },
      );

    expect(
      resolveGitHubProjectForRepositories(connected, [candidate("one"), candidate("two")]),
    ).toMatchObject({ status: "ambiguous" });
  });

  it("does not silently choose between ambiguous matching Projects", () => {
    const result = resolveGitHubProjectForRepositories(
      ["OzAvrahami/projectdeck"],
      [project("one", ["OzAvrahami/projectdeck"]), project("two", ["OzAvrahami/projectdeck"])],
    );

    expect(result).toMatchObject({ status: "ambiguous" });
    expect(result.candidates).toHaveLength(2);
  });

  it("normalizes Standard v1 Issue signals and ignores Project drafts", () => {
    expect(normalizeGitHubProjectItem({ content: { __typename: "DraftIssue" } })).toBeNull();
    expect(
      normalizeGitHubProjectItem({
        id: "item-id",
        content: {
          __typename: "Issue",
          id: "issue-id",
          number: 7,
          title: "Automatic phase",
          state: "OPEN",
          updatedAt: "2026-08-28T10:00:00Z",
          url: "https://github.com/OzAvrahami/projectdeck/issues/7",
          repository: { nameWithOwner: "OzAvrahami/projectdeck" },
          labels: { nodes: [{ name: "feature" }] },
        },
        fieldValues: {
          nodes: [
            { __typename: "ProjectV2ItemFieldSingleSelectValue", name: "In Progress", field: { name: "Status" } },
            { __typename: "ProjectV2ItemFieldSingleSelectValue", name: "P1 — High", field: { name: "Priority" } },
          ],
        },
      }),
    ).toMatchObject({
      repository: "OzAvrahami/projectdeck",
      number: 7,
      state: "open",
      status: "In Progress",
      priority: "P1 — High",
      statusRecognized: true,
      priorityRecognized: true,
    });
  });

  it("preserves an unset Status as incomplete evidence", () => {
    const result = normalizeGitHubProjectItem({
      id: "item-id",
      content: {
        __typename: "Issue",
        id: "issue-id",
        number: 8,
        title: "Unclassified work",
        state: "OPEN",
        repository: { nameWithOwner: "OzAvrahami/projectdeck" },
        labels: { nodes: [] },
      },
      fieldValues: { nodes: [] },
    });

    expect(result).toMatchObject({
      status: null,
      statusRecognized: false,
      priority: null,
      priorityRecognized: true,
    });
  });

  it("normalizes Project fields, views, workflows, and Issue values for Standard audit reuse", async () => {
    const field = (id, name, options) => ({
      __typename: "ProjectV2SingleSelectField",
      id,
      name,
      options: options.map((option, index) => ({
        id: `${id}-${index}`,
        name: option,
        color: "GRAY",
        description: "",
      })),
    });
    const node = {
      id: "project-id",
      number: 9,
      title: "ProjectDeck Development",
      url: "https://github.com/users/OzAvrahami/projects/9",
      fields: {
        totalCount: 2,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          field("status", "Status", ["Backlog", "Ready", "In Progress", "Verify", "Done"]),
          field("priority", "Priority", ["P0 — Critical", "P1 — High", "P2 — Medium", "P3 — Low"]),
        ],
      },
      views: {
        totalCount: 2,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: "view-development",
            number: 1,
            name: "Development",
            layout: "BOARD_LAYOUT",
            filter: "",
            groupByFields: { nodes: [] },
            verticalGroupByFields: { nodes: [{ __typename: "ProjectV2SingleSelectField", id: "status", name: "Status" }] },
          },
          {
            id: "view-all",
            number: 2,
            name: "All work",
            layout: "TABLE_LAYOUT",
            filter: "",
            groupByFields: { nodes: [] },
            verticalGroupByFields: { nodes: [] },
          },
        ],
      },
      workflows: {
        totalCount: 1,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [{ id: "workflow", number: 1, name: "Item closed", enabled: true }],
      },
      items: {
        totalCount: 1,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [{
          id: "item-id",
          content: {
            __typename: "Issue",
            id: "issue-id",
            number: 9,
            title: "Audit workflows",
            state: "OPEN",
            updatedAt: "2026-09-05T10:00:00Z",
            url: "https://github.com/OzAvrahami/ProjectDeck/issues/9",
            repository: { id: "repo-id", databaseId: 1, nameWithOwner: "OzAvrahami/ProjectDeck" },
            labels: { nodes: [{ name: "feature" }] },
          },
          fieldValues: {
            nodes: [
              { __typename: "ProjectV2ItemFieldSingleSelectValue", name: "In Progress", field: { name: "Status" } },
              { __typename: "ProjectV2ItemFieldSingleSelectValue", name: "P1 — High", field: { name: "Priority" } },
            ],
          },
        }],
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { node } }), { status: 200 }),
    );

    const result = await fetchGitHubProjectReadModel({
      id: "project-id",
      linkedRepositories: [{ fullName: "OzAvrahami/ProjectDeck" }],
      linkedRepositoryCount: 1,
      repositoryEvidencePartial: false,
    }, { token: "projects-token", fetchImpl });

    expect(result).toMatchObject({
      statusField: { available: true, standard: true },
      priorityField: { available: true, standard: true },
      fieldsPartial: false,
      viewsPartial: false,
      workflowsPartial: false,
      workflows: [{ name: "Item closed", enabled: true }],
      items: [{ number: 9, status: "In Progress", priority: "P1 — High", labels: ["feature"] }],
    });
    expect(result.views[0]).toMatchObject({
      name: "Development",
      layout: "BOARD_LAYOUT",
      groupByFields: [],
      verticalGroupByFields: [{ name: "Status" }],
    });
  });

  it("keeps a null private repository association as partial evidence instead of throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            viewer: {
              projectsV2: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    id: "project-id",
                    number: 4,
                    title: "LimitPact Development",
                    url: "https://github.com/users/owner/projects/4",
                    closed: false,
                    repositories: {
                      totalCount: 2,
                      pageInfo: { hasNextPage: false, endCursor: null },
                      nodes: [
                        {
                          id: "R_public",
                          databaseId: 1335366662,
                          nameWithOwner: "OzAvrahami/limitpact-website",
                        },
                        null,
                      ],
                    },
                  },
                ],
              },
            },
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      fetchUserGitHubProjects({ token: "projects-token", fetchImpl }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "project-id",
        linkedRepositoryCount: 2,
        inaccessibleRepositoryCount: 1,
        repositoryEvidencePartial: true,
        linkedRepositories: [
          {
            nodeId: "R_public",
            databaseId: "1335366662",
            fullName: "OzAvrahami/limitpact-website",
          },
        ],
      }),
    ]);
  });

  it.each([
    [401, "authentication_failed"],
    [403, "permission_denied"],
    [500, "provider_failed"],
  ])("classifies HTTP %s without collapsing provider causes", async (status, code) => {
    await expect(
      fetchUserGitHubProjects({
        token: "projects-token",
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ message: "failure" }), { status }),
        ),
      }),
    ).rejects.toMatchObject({ code });
  });
});
