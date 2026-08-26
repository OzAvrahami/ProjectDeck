import { describe, expect, it } from "vitest";

import {
  buildQuickLinks,
  listDocumentationResources,
} from "../../lib/projects/workspace.js";

const resources = [
  {
    id: "repo",
    provider: "github",
    resourceType: "repository",
    label: "limitpact-desktop",
    componentName: "Desktop",
    url: "https://github.com/example/limitpact-desktop",
  },
  {
    id: "docs",
    provider: null,
    resourceType: "documentation",
    label: "Product docs",
    componentName: null,
    url: "https://example.com/docs",
  },
];

describe("Project Workspace resource composition", () => {
  it("filters the Docs tab without hiding resources from Quick links", () => {
    expect(listDocumentationResources(resources).map(({ id }) => id)).toEqual([
      "docs",
    ]);
    expect(buildQuickLinks(resources)).toHaveLength(2);
  });

  it("makes multi-repository link scope clear", () => {
    expect(buildQuickLinks(resources)[0]).toMatchObject({
      label: "GitHub — Desktop",
      context: "Github",
    });
  });
});
