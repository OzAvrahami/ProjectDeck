import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProjectCard } from "../../components/portfolio/project-card.js";
import { WorkspaceReleases } from "../../components/workspace/workspace-releases.js";
import { ReleasesView } from "../../components/github/github-observation-views.js";
import { buildProjectCardViewModel } from "../../lib/projects/portfolio.js";
import { summarizeProjectReleases } from "../../lib/projects/github-summary.js";
import { observeProjectsGitHub } from "../../lib/projects/github-observations.js";

vi.mock("server-only", () => ({}));

const project = { id: "p", slug: "sample", name: "Sample", components: [] };
function observation(name = "desktop", { tag = "v1.1.0", unavailable = false, prerelease = false } = {}) {
  const repository = { owner: "example", name, fullName: `example/${name}` };
  return {
    resourceId: name, repository, componentId: name, componentName: name,
    release: unavailable
      ? { status: "unavailable", error: { code: "provider" } }
      : { status: "success", item: tag ? {
        id: name, tagName: tag, name: `Release ${tag}`, repository,
        url: `https://github.com/example/${name}/releases/tag/${tag}`,
        publishedAt: "2026-09-01T12:00:00Z", prerelease,
      } : null },
  };
}
function observed(observations) {
  return { ...project, githubSummary: { releases: summarizeProjectReleases(project, observations) } };
}
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const card = (value) => render(ProjectCard, { card: buildProjectCardViewModel(value) });
const links = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, body]) => ({ attrs, body }));

describe("Release navigation on Project cards", () => {
  it("provides an explicit internal route and an accessible authoritative GitHub action", () => {
    const html = card(observed([observation()]));
    const anchors = links(html);
    expect(anchors.some(({ attrs, body }) => attrs.includes('/projects/sample?tab=releases') && body.includes('Releases'))).toBe(true);
    const external = anchors.find(({ attrs }) => attrs.includes('https://github.com/example/desktop/releases/tag/v1.1.0'));
    expect(external.attrs).toContain('target="_blank"');
    expect(external.attrs).toContain('rel="noreferrer"');
    expect(external.attrs).toContain('Open published GitHub Release v1.1.0 for Sample (opens in a new tab)');
    expect(external.body).toContain('↗');
    expect(external.attrs).toContain('release-navigation');
    expect(anchors.every(({ body }) => !body.includes('<a '))).toBe(true);
    expect(anchors[0].attrs).toContain('href="/projects/sample"');
  });

  it.each([
    [[observation("desktop", { tag: null })], "No published Release"],
    [[observation("desktop", { unavailable: true })], "Release unavailable"],
    [[observation(), observation("website", { unavailable: true })], "Release information incomplete"],
  ])("keeps empty and uncertain values non-actionable: %s", (observations, label) => {
    const html = card(observed(observations));
    expect(html).toContain(label);
    expect(links(html).some(({ attrs }) => attrs.includes('/projects/sample?tab=releases'))).toBe(true);
    expect(links(html).some(({ attrs }) => attrs.includes('github.com'))).toBe(false);
    expect(links(html).some(({ body }) => body.includes(label))).toBe(false);
  });

  it("keeps a single released Component scoped and multiple Releases as a count", () => {
    const one = card(observed([observation(), observation("website", { tag: null })]));
    expect(one).toContain("desktop · v1.1.0");
    expect(one).not.toContain('href="https://github.com/');
    const both = card(observed([observation(), observation("website", { tag: "v2.0.0" })]));
    expect(both).toContain("2 component releases");
    expect(both).not.toContain("v2.0.0");
  });

  it("does not turn tag or recorded manifest metadata into Release evidence", () => {
    const value = observed([observation("desktop", { tag: null })]);
    value.components = [{ id: "desktop", name: "Desktop", currentVersion: "v9.0.0" }];
    value.tags = ["v9.0.0"];
    expect(card(value)).toContain("No published Release");
    expect(card(value)).not.toContain("v9.0.0");
  });

  it("keeps the prerelease marker beside an actionable single-repository tag", () => {
    const html = card(observed([observation("desktop", { prerelease: true })]));
    expect(html).toContain("v1.1.0 · pre-release");
    expect(html).toContain('href="https://github.com/example/desktop/releases/tag/v1.1.0"');
  });
});

describe("Workspace Release hierarchy and scope", () => {
  it("shows latest, name, publication date, prerelease, exact source and history", () => {
    const html = render(WorkspaceReleases, { project: observed([observation("desktop", { prerelease: true })]) });
    expect(html).toContain("Latest Release");
    expect(html).toContain("Release v1.1.0");
    expect(html).toContain("Pre-release");
    expect(html).toContain('dateTime="2026-09-01T12:00:00Z"');
    expect(html).toContain("Open on GitHub");
    expect(html).toContain('href="https://github.com/example/desktop/releases/tag/v1.1.0"');
    expect(html).toContain('href="https://github.com/example/desktop/releases"');
    expect(html).toContain("Release history on GitHub");
  });

  it("shows independent versions with scope before each version", () => {
    const html = render(WorkspaceReleases, { project: observed([observation(), observation("website", { tag: "v2.0.0" })]) });
    const rows = [...html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/g)].map((match) => match[1]);
    expect(rows).toHaveLength(2);
    for (const [index, scope] of ["desktop", "website"].entries()) {
      expect(rows[index].indexOf(`>${scope}</h3>`)).toBeLessThan(rows[index].indexOf("Latest Release"));
      expect(rows[index]).toContain(`https://github.com/example/${scope}/releases/tag/`);
    }
  });

  it("keeps successful absence, unavailable and partial evidence distinct", () => {
    const html = render(WorkspaceReleases, { project: observed([observation(), observation("website", { tag: null }), observation("service", { unavailable: true })]) });
    expect(html).toContain("Release information incomplete");
    expect(html).toContain("No published Release");
    expect(html).toContain("Release unavailable");
    expect(links(html).filter(({ attrs }) => attrs.includes('/releases/tag/'))).toHaveLength(1);
    expect(render(WorkspaceReleases, { project: observed([]) })).toContain("No connected GitHub repositories");
  });

  it("retains long names and prerelease labels without copying Release bodies", () => {
    const item = observation("a-very-long-component-and-repository-name".repeat(5), { prerelease: true });
    item.release.item.name = "Long release name ".repeat(30);
    item.release.item.body = "Body must stay on GitHub";
    const html = render(WorkspaceReleases, { project: observed([item]) });
    expect(html).toContain(item.release.item.name.trim());
    expect(html).toContain("Pre-release");
    expect(html).not.toContain(item.release.item.body);
  });
});

describe("Global Release navigation", () => {
  it("keeps Project and repository identity beside an explicit GitHub action", () => {
    const summary = observed([observation()]).githubSummary.releases;
    const html = render(ReleasesView, { releases: summary.items, check: { repositoryCount: 1, checkedRepositoryCount: 1, failedRepositoryCount: 0 } });
    expect(html).toContain('href="/projects/sample?tab=releases"');
    expect(html).toContain("Sample");
    expect(html).toContain("desktop · example/desktop");
    expect(html).toContain("v1.1.0");
    expect(html).toContain("Published");
    expect(html).toContain("Open Release on GitHub");
    expect(html).toContain("opens in a new tab");
  });

  it.each([
    [{ repositoryCount: 0, checkedRepositoryCount: 0, failedRepositoryCount: 0 }, "No connected GitHub repositories"],
    [{ repositoryCount: 1, checkedRepositoryCount: 1, failedRepositoryCount: 0 }, "No published Releases"],
    [{ repositoryCount: 1, checkedRepositoryCount: 0, failedRepositoryCount: 1 }, "Release unavailable"],
    [{ repositoryCount: 2, checkedRepositoryCount: 1, failedRepositoryCount: 1 }, "Release information incomplete"],
  ])("keeps empty and uncertain global states distinct", (check, label) => {
    const html = render(ReleasesView, { releases: [], check: { ...check, failures: [] } });
    expect(html).toContain(label);
    expect(links(html)).toHaveLength(0);
  });
});

describe("Release-only provider boundary", () => {
  it("requests only Release endpoints and carries a failed repository through to partial UI", async () => {
    const input = {
      ...project,
      githubRepositories: ["desktop", "website"].map((name) => ({
        id: name, provider: "github", resourceType: "repository",
        url: `https://github.com/example/${name}`, componentId: name, componentName: name,
      })),
    };
    const fetchImpl = vi.fn(async (url) => {
      if (new URL(url).pathname.includes("website")) return new Response(null, { status: 503 });
      return Response.json([{
        id: 1, tag_name: "v1.1.0", html_url: "https://github.com/example/desktop/releases/tag/v1.1.0",
        published_at: "2026-09-01T12:00:00Z", prerelease: false, draft: false,
      }]);
    });
    const [result] = await observeProjectsGitHub([input], { features: ["releases"], token: "test", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([url]) => new URL(url).pathname).sort()).toEqual([
      "/repos/example/desktop/releases", "/repos/example/website/releases",
    ]);
    expect(result.githubSummary.releases.status).toBe("partial");
    const html = render(WorkspaceReleases, { project: result });
    expect(html).toContain("Release information incomplete");
    expect(html).toContain("Release unavailable");
    expect(links(html).filter(({ attrs }) => attrs.includes("/releases/tag/"))).toHaveLength(1);
    expect(card(result)).not.toContain('href="https://github.com/');
  });
});
