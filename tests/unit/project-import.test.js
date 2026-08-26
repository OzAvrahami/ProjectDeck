import { describe, expect, it } from "vitest";

import {
  chooseProjectAccent,
  ImportValidationError,
  uniqueProjectSlug,
  validateGitHubImportCandidates,
} from "../../lib/projects/import-logic.js";

describe("GitHub Project candidate import logic", () => {
  it("rejects duplicate repository identities before persistence", () => {
    expect(() =>
      validateGitHubImportCandidates([
        {
          projectName: "One",
          repositories: [{ externalId: "123" }],
        },
        {
          projectName: "Two",
          repositories: [{ externalId: "123" }],
        },
      ]),
    ).toThrow(ImportValidationError);
  });

  it("normalizes optional next actions and component names", () => {
    expect(
      validateGitHubImportCandidates([
        {
          projectName: " LimitPact ",
          nextAction: " ",
          repositories: [
            { externalId: "123", componentName: " Desktop " },
          ],
        },
      ]),
    ).toEqual([
      {
        targetProjectId: null,
        projectName: "LimitPact",
        nextAction: null,
        repositories: [{ externalId: "123", componentName: "Desktop" }],
      },
    ]);
  });

  it("creates stable accents and collision-safe slugs", () => {
    expect(chooseProjectAccent("LifeOS")).toBe(chooseProjectAccent("LifeOS"));

    const usedSlugs = new Set(["lifeos"]);
    expect(uniqueProjectSlug("LifeOS", usedSlugs)).toBe("lifeos-2");
    expect(uniqueProjectSlug("LifeOS", usedSlugs)).toBe("lifeos-3");
  });
});
