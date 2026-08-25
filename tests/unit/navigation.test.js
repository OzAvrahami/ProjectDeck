import { describe, expect, it } from "vitest";

import { PROJECT_SECTIONS } from "../../lib/projects/navigation";

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
});
