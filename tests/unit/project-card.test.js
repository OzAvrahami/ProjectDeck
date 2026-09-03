import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const cardSource = source("../../components/portfolio/project-card.js");
const cssSource = source("../../app/globals.css");
const homeSource = source("../../components/portfolio/portfolio-home.js");
const projectsSource = source("../../components/projects/projects-view.js");
const portfolioSource = source("../../lib/projects/portfolio.js");
const workspaceSource = source("../../components/workspace/project-workspace.js");

describe("Project card hierarchy", () => {
  it("renders the full signal hierarchy in deliberate source order", () => {
    const tokens = [
      "<header className=\"project-card-identity\">",
      "<ProjectState card={card} />",
      "<AttentionSummary card={card} />",
      "<NextSummary card={card} next={next} />",
      "<dl className=\"project-card-metadata\"",
      "<LatestCommitSummary card={card}",
    ];
    const positions = tokens.map((token) => cardSource.indexOf(token));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("uses a monogram identity fallback without inferring provider artwork", () => {
    expect(cardSource).toContain("export function ProjectMark");
    expect(cardSource).toContain("{card.mark}");
    expect(cardSource).not.toContain("githubAvatar");
    expect(cardSource).not.toContain("providerLogo");
    expect(cardSource).not.toContain("<img");
  });

  it("omits a missing tagline and retains full context for clamped text", () => {
    expect(cardSource).toContain("{card.tagline ? (");
    expect(cardSource).toContain("title={card.tagline}");
    expect(cardSource).not.toContain("No tagline");
    expect(cardSource).toContain("title={card.name}");
  });

  it("keeps Phase and Health separate, textual, and semantically grouped", () => {
    expect(cardSource).toContain('<dl className="project-card-state"');
    expect(cardSource).toContain('<dt className="project-card-state-label">Phase</dt>');
    expect(cardSource).toContain('<dt className="project-card-state-label">Health</dt>');
    expect(cardSource).toContain("{card.phaseLabel}");
    expect(cardSource).toContain("{card.health.label}");
    expect(cardSource).toContain("phase-${card.phase}");
    expect(cardSource).toContain("health-${card.health.status}");
  });

  it("retains manual Phase context without exposing automatic inference detail", () => {
    expect(cardSource).toContain('card.phaseSource === "override"');
    expect(cardSource).toContain('className="project-card-state-note">Manual');
    expect(cardSource).not.toContain("Automatic · ${card.phaseReason}");
  });

  it("renders a compact attention treatment only when attention exists", () => {
    expect(cardSource).toContain("if (!card.needsAttention) return null");
    expect(cardSource).toContain('className="project-card-attention"');
    expect(cardSource).toContain("card.attention.primary_reason");
    expect(cardSource).not.toContain("No current high-confidence attention signals");
  });

  it("shows attention severity and manual or automatic source", () => {
    expect(cardSource).toContain('data-severity={severity}');
    expect(cardSource).toContain('card.attention.source === "manual"');
    expect(cardSource).toContain('[severityLabel, source]');
  });

  it("keeps Next prominent and labels both automatic and manual modes", () => {
    expect(cardSource).toContain('className="project-card-next"');
    expect(cardSource).toContain('const sourceLabel = next.isManual ? "Manual" : "Automatic"');
    expect(cardSource).toContain("project-card-next-title");
    expect(portfolioSource).toContain('label: next.source === "none" ? "No clear next action" : "Unavailable"');
  });

  it("clamps long identity, Next, attention, metadata, and commit text", () => {
    for (const className of [
      ".project-card-name",
      ".project-card-tagline",
      ".project-card-attention-reason",
      ".project-card-next-title",
      ".project-card-next-meta",
      ".project-card-metadata-link",
      ".project-card-latest-subject",
    ]) {
      expect(cssSource).toContain(className);
    }
    expect(cssSource.match(/-webkit-line-clamp:/g)?.length).toBeGreaterThanOrEqual(7);
  });
});

describe("Project card portfolio metadata", () => {
  it("renders Bug and open-count destinations as distinct secondary links", () => {
    expect(cardSource).toContain("card.issueSummary.segments.map");
    expect(cardSource).toContain("segment.href");
    expect(cardSource).toContain('segment.key === "bugs"');
    expect(cardSource).toContain("View Bugs for");
    expect(cardSource).toContain("View open Issues for");
  });

  it("makes Bugs more prominent than the total while preserving plus semantics", () => {
    expect(cardSource).toContain('"font-bold text-foreground"');
    expect(cardSource).toContain('"font-medium text-muted"');
    expect(cardSource).toContain("{segment.label}");
    expect(portfolioSource).toContain("project.githubSummary.issues.bugLabel");
    expect(portfolioSource).toContain("project.githubSummary.issues.openLabel");
  });

  it("renders the authoritative Release summary as a sibling link", () => {
    expect(cardSource).toContain("card.releaseSummary.href");
    expect(cardSource).toContain("card.releaseSummary.label");
    expect(cardSource).toContain("View Releases for");
    expect(workspaceSource).toContain("No published GitHub Release");
    expect(workspaceSource).toContain("Release data unavailable");
  });

  it("does not duplicate the raw Component list on compact cards", () => {
    expect(cardSource).not.toContain("card.components.map");
    expect(cardSource).not.toContain(">Components<");
    expect(portfolioSource).toContain("components: (project.components ?? [])");
  });

  it("preserves explicit Latest Commit language, relative time, and scope", () => {
    expect(cardSource).toContain("Latest commit{relative}");
    expect(cardSource).toContain("card.latestCommit.relativeLabel");
    expect(cardSource).toContain("card.latestCommit.scopeLabel");
    expect(cardSource).toContain("card.latestCommit.commit?.url");
    expect(cardSource).not.toContain("Recent:");
  });

  it("keeps partial and unavailable labels supplied by normalized summaries", () => {
    expect(cardSource).toContain("{card.releaseSummary.label}");
    expect(cardSource).toContain("{segment.label}");
    expect(cardSource).toContain("{subject}");
    expect(portfolioSource).toContain('relativeLabel: state === "partial" ? "partial" : null');
    expect(portfolioSource).toContain('subject: "Latest commit unavailable"');
  });
});

describe("Project card layout, themes, and interactions", () => {
  it("uses bounded card dimensions and a narrow-screen metadata fallback", () => {
    expect(cssSource).toContain("min-height: 360px");
    expect(cssSource).toContain("@media (max-width: 380px)");
    expect(cssSource).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("retains responsive portfolio grids on Home and Projects", () => {
    const grid = "grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]";
    expect(homeSource).toContain(grid);
    expect(projectsSource).toContain(grid);
  });

  it("defines every Phase status token in light, dark, and system-dark themes", () => {
    for (const token of [
      "--status-planning",
      "--status-development",
      "--status-maintenance",
      "--status-paused",
      "--status-archived",
      "--status-unknown",
    ]) {
      expect(cssSource.match(new RegExp(token, "g"))?.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses theme tokens for attention, state, surfaces, and text contrast", () => {
    expect(cssSource).toContain("background: var(--attention-background)");
    expect(cssSource).toContain("border-left: 2px solid var(--attention)");
    expect(cssSource).toContain("background: var(--surface)");
    expect(cssSource).toContain("color: var(--subtle)");
  });

  it("keeps the card overlay free of nested interactive elements", () => {
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

  it("keeps independent interactions above the overlay with visible focus", () => {
    expect(cssSource).toMatch(/\.project-card-open\s*\{[^}]*z-index:\s*1/s);
    expect(cssSource).toMatch(/\.project-card-secondary-link\s*\{[^}]*z-index:\s*2/s);
    expect(cssSource).toContain("a:focus-visible");
    expect(cardSource).toContain("Open Next Issue for");
    expect(cardSource).toContain("Open latest commit for");
  });

  it("does not perform provider work from card rendering", () => {
    expect(cardSource).not.toMatch(/\bfetch\s*\(/);
    expect(cardSource).not.toMatch(/observeProjects|github|railway|postgres|provider/i);
    expect(cardSource.match(/^import /gm)).toHaveLength(2);
  });
});
