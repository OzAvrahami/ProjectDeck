import { describe, expect, it, vi } from "vitest";

import { observeProjectPhaseEvidence } from "../../lib/projects/phase-observations.js";

vi.mock("server-only", () => ({}));

describe("Project phase observation failures", () => {
  it("keeps a missing Projects token local and explicit", async () => {
    const evidence = await observeProjectPhaseEvidence(
      [
        {
          id: "project-id",
          phaseOverride: null,
          githubRepositories: [
            {
              provider: "github",
              resourceType: "repository",
              url: "https://github.com/OzAvrahami/projectdeck",
            },
          ],
        },
      ],
      { token: "" },
    );

    expect(evidence.get("project-id")).toEqual({
      status: "unavailable",
      error: {
        code: "token_missing",
        message: "GITHUB_PROJECTS_TOKEN is not configured on the ProjectDeck server.",
      },
    });
  });

  it("does not call GitHub Projects when both Phase and Next have manual overrides", async () => {
    const fetchImpl = vi.fn();
    const evidence = await observeProjectPhaseEvidence(
      [{ id: "project-id", phaseOverride: "paused", nextAction: "Ship the build" }],
      { token: "", fetchImpl },
    );

    expect(evidence.size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves Project v2 data when a private connected repository is hidden from the Projects token", async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      const { query } = JSON.parse(options.body);

      if (query.includes("ProjectDeckProjects")) {
        return new Response(
          JSON.stringify({
            data: {
              viewer: {
                projectsV2: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      id: "limitpact-project",
                      number: 4,
                      title: "LimitPact Development",
                      url: "https://github.com/users/owner/projects/4",
                      closed: false,
                      repositories: {
                        totalCount: 2,
                        pageInfo: { hasNextPage: false, endCursor: null },
                        nodes: [
                          {
                            id: "R_website",
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
        );
      }

      return new Response(
        JSON.stringify({
          data: {
            node: {
              id: "limitpact-project",
              number: 4,
              title: "LimitPact Development",
              url: "https://github.com/users/owner/projects/4",
              fields: {
                nodes: [
                  {
                    __typename: "ProjectV2SingleSelectField",
                    name: "Status",
                    options: ["Backlog", "Ready", "In Progress", "Verify", "Done"].map((name) => ({ name })),
                  },
                  {
                    __typename: "ProjectV2SingleSelectField",
                    name: "Priority",
                    options: ["P0 — Critical", "P1 — High", "P2 — Medium", "P3 — Low"].map((name) => ({ name })),
                  },
                ],
              },
              items: {
                totalCount: 0,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [],
              },
            },
          },
        }),
        { status: 200 },
      );
    });
    const evidence = await observeProjectPhaseEvidence(
      [
        {
          id: "limitpact",
          phaseOverride: null,
          githubRepositories: [
            {
              provider: "github",
              resourceType: "repository",
              externalId: "1334498331",
              url: "https://github.com/OzAvrahami/limitpact-desktop",
            },
            {
              provider: "github",
              resourceType: "repository",
              externalId: "1335366662",
              url: "https://github.com/OzAvrahami/limitpact-website",
            },
          ],
        },
      ],
      { token: "projects-token", fetchImpl },
    );

    expect(evidence.get("limitpact")).toMatchObject({
      status: "resolved",
      reason: "repository_set_with_partial_visibility",
      repositoryVisibility: "partial",
      evidenceStatus: "partial",
      readModel: {
        title: "LimitPact Development",
        linkedRepositoryCount: 2,
      },
    });
  });
});
