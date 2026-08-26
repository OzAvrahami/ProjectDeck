import { describe, expect, it } from "vitest";

import {
  PORTFOLIO_NAVIGATION,
  PROJECT_SECTIONS,
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

  it("activates only implemented portfolio destinations", () => {
    expect(
      PORTFOLIO_NAVIGATION.filter((item) => item.enabled).map(
        (item) => item.label,
      ),
    ).toEqual(["Overview", "Releases", "Issues"]);
    expect(
      PORTFOLIO_NAVIGATION.find((item) => item.label === "Activity"),
    ).toMatchObject({ enabled: false, href: null });
  });
});
