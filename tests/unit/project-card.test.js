import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cardSource = readFileSync(
  fileURLToPath(
    new URL("../../components/portfolio/project-card.js", import.meta.url),
  ),
  "utf8",
);
const workspaceSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../components/workspace/project-workspace.js",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("Project card Issue navigation", () => {
  it("renders Bug and open-count destinations as card secondary links", () => {
    expect(cardSource).toContain('item.key === "issues"');
    expect(cardSource).toContain("segment.href");
    expect(cardSource).toContain("project-card-secondary-link");
  });

  it("keeps the card overlay link free of nested interactive elements", () => {
    const overlayStart = cardSource.indexOf(
      '<Link\n        className="project-card-open"',
    );
    const overlayEnd = cardSource.indexOf("</Link>", overlayStart);
    const overlayMarkup = cardSource.slice(overlayStart, overlayEnd);

    expect(overlayStart).toBeGreaterThan(-1);
    expect(overlayEnd).toBeGreaterThan(overlayStart);
    expect(overlayMarkup.match(/<Link/g)).toHaveLength(1);
    expect(overlayMarkup).not.toContain("<a");
  });

  it("offers All open Issues and canonical Bugs filters in the Workspace", () => {
    expect(workspaceSource).toContain('aria-label="Issue filters"');
    expect(workspaceSource).toContain("All open Issues");
    expect(workspaceSource).toContain("type: \"bug\"");
  });

  it("renders the authoritative Release summary as a secondary link", () => {
    expect(cardSource).toContain("card.releaseSummary.href");
    expect(cardSource).toContain("item.href");
    expect(cardSource).toContain("project-card-secondary-link");
    expect(workspaceSource).toContain("No published GitHub Release");
    expect(workspaceSource).toContain("Release data unavailable");
    expect(workspaceSource).toContain("Recorded app version");
    expect(workspaceSource).toContain("not a published GitHub Release");
  });
});
