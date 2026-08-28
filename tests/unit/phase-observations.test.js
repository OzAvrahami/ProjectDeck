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
        code: "missing_token",
        message: "GITHUB_PROJECTS_TOKEN is not configured on the ProjectDeck server.",
      },
    });
  });

  it("does not call GitHub Projects when every Project has an override", async () => {
    const fetchImpl = vi.fn();
    const evidence = await observeProjectPhaseEvidence(
      [{ id: "project-id", phaseOverride: "paused" }],
      { token: "", fetchImpl },
    );

    expect(evidence.size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
