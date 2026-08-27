import { describe, expect, it } from "vitest";

import {
  ADD_PROJECTS_HREF,
  PORTFOLIO_NAVIGATION,
  PROJECT_SECTIONS,
  projectEditHref,
} from "../../lib/projects/navigation";

describe("portfolio navigation", () => {
  it("keeps the approved global destinations in order", () => {
    expect(PROJECT_SECTIONS).toEqual([
      "Overview",
      "Projects",
      "Activity",
      "Releases",
      "Issues",
    ]);
  });

  it("activates every completed MVP portfolio destination", () => {
    expect(
      PORTFOLIO_NAVIGATION.filter((item) => item.enabled).map(
        (item) => item.label,
      ),
    ).toEqual(["Overview", "Projects", "Activity", "Releases", "Issues"]);
    expect(
      PORTFOLIO_NAVIGATION.find((item) => item.label === "Activity"),
    ).toMatchObject({ enabled: true, href: "/activity" });
  });

  it("uses the existing GitHub import and Project edit destinations", () => {
    expect(ADD_PROJECTS_HREF).toBe("/setup/github");
    expect(projectEditHref("limitpact")).toBe("/projects/limitpact/edit");
  });
});
