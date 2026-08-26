import { describe, expect, it } from "vitest";

import {
  applyCandidateGrouping,
  createGroupingDraft,
  createProjectCandidates,
  separateProjectCandidate,
} from "../../lib/github/import-candidates.js";

const repositories = [
  { id: "1", name: "lifeos", fullName: "owner/lifeos" },
  {
    id: "2",
    name: "limitpact-desktop",
    fullName: "owner/limitpact-desktop",
  },
  {
    id: "3",
    name: "limitpact-website",
    fullName: "owner/limitpact-website",
  },
  { id: "4", name: "cockpitpath", fullName: "owner/cockpitpath" },
];

describe("GitHub import Project candidates", () => {
  it("creates one Project candidate per selected repository", () => {
    const candidates = createProjectCandidates(repositories);

    expect(candidates).toHaveLength(4);
    expect(candidates.map((candidate) => candidate.repositories)).toEqual([
      [{ externalId: "1", componentName: "" }],
      [{ externalId: "2", componentName: "" }],
      [{ externalId: "3", componentName: "" }],
      [{ externalId: "4", componentName: "" }],
    ]);
  });

  it("groups only the explicitly selected candidates", () => {
    const candidates = createProjectCandidates(repositories);
    const draft = createGroupingDraft(
      candidates,
      ["candidate-2", "candidate-3"],
      repositories,
    );
    const grouped = applyCandidateGrouping(candidates, draft);

    expect(grouped).toHaveLength(3);
    expect(grouped[0].repositories).toEqual([
      { externalId: "1", componentName: "" },
    ]);
    expect(grouped[1]).toMatchObject({
      projectName: "Limitpact",
      repositories: [
        { externalId: "2", componentName: "Desktop" },
        { externalId: "3", componentName: "Website" },
      ],
    });
    expect(grouped[2].repositories).toEqual([
      { externalId: "4", componentName: "" },
    ]);
  });

  it("does not create a grouping draft for fewer than two candidates", () => {
    const candidates = createProjectCandidates(repositories);

    expect(
      createGroupingDraft(candidates, ["candidate-2"], repositories),
    ).toBeNull();
  });

  it("can separate an explicitly grouped candidate again", () => {
    const candidates = createProjectCandidates(repositories.slice(1, 3));
    const draft = createGroupingDraft(
      candidates,
      candidates.map((candidate) => candidate.id),
      repositories,
    );
    const grouped = applyCandidateGrouping(candidates, draft);

    expect(
      separateProjectCandidate(grouped, grouped[0].id, repositories),
    ).toEqual(candidates);
  });
});
