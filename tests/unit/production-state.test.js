import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { ProductionState } from "../../components/workspace/production-state.js";
import { buildProductionState, presentDeployment, presentHealthBasis } from "../../lib/projects/production-state.js";
import { aggregateProjectHealth, healthObservation } from "../../lib/health/model.js";
import { railwayServiceDeploymentHealth } from "../../lib/health/providers/railway-connection.js";
import { summarizeProjectReleases } from "../../lib/projects/github-summary.js";

vi.mock("server-only", () => ({}));

const identity = { id: "p", name: "Example", slug: "example", components: [] };
const association = { id: "railway", metadata: { environmentName: "production", serviceName: "Web service" } };
function releaseObservation(tag = "v1.1.1", component = null, unavailable = false) {
  const repository = { owner: "example", name: component?.id ?? "app", fullName: `example/${component?.id ?? "app"}` };
  return {
    resourceId: repository.name, repository, componentId: component?.id, componentName: component?.name,
    release: unavailable ? { status: "unavailable", error: { code: "provider" } } : {
      status: "success", item: tag ? {
        tagName: tag, repository, url: `https://github.com/${repository.fullName}/releases/tag/${tag}`,
        publishedAt: "2026-09-01T12:00:00Z", prerelease: false,
      } : null,
    },
  };
}
function runtime(component = null, status = "healthy") {
  return healthObservation({
    monitor: { id: "http", label: "Application endpoint", monitorType: "http", enabled: true, affectsProjectHealth: true, component },
    status, reason: status === "healthy" ? "Health endpoint returned HTTP 200." : "Runtime check could not be verified.",
  });
}
function deployment({ status = "success", active = true, affects = true, component = null } = {}) {
  const latest = { id: "latest-B", status, observedStateAt: "2026-09-01T12:00:00Z" };
  return healthObservation({
    monitor: { id: "railway", label: "Web service", monitorType: "railway_connection", enabled: true, affectsProjectHealth: affects, component },
    ...railwayServiceDeploymentHealth([latest], active ? { id: "serving-A", status: "success" } : null),
  });
}
function project(releases, observations, components = []) {
  return {
    ...identity, components, providerAssociations: [association],
    githubSummary: { releases: summarizeProjectReleases(identity, releases) },
    health: aggregateProjectHealth(observations),
  };
}
const html = (value) => renderToStaticMarkup(createElement(ProductionState, { project: value }));

describe("Release, Deployment and Health state matrix", () => {
  it("A: keeps a published Release, serving deployment, and Healthy runtime independent", () => {
    const value = project([releaseObservation()], [deployment(), runtime()]);
    const scope = buildProductionState(value).scopes[0];
    expect(scope.releases[0].latestRelease.tagName).toBe("v1.1.1");
    expect(scope.deployments[0]).toMatchObject({ serving: "Active", servingId: "serving-A", latest: "Succeeded", latestId: "latest-B" });
    expect(scope.health.status).toBe("healthy");
    expect(scope.health).toBe(value.health);
  });

  it("B: preserves an informational failed attempt alongside the older serving deployment and Healthy runtime", () => {
    const value = project([releaseObservation()], [deployment({ status: "failed", affects: false }), runtime()]);
    const scope = buildProductionState(value).scopes[0];
    expect(scope.deployments[0]).toMatchObject({ latest: "Failed", serving: "Active", servingId: "serving-A" });
    expect(scope.health.status).toBe("healthy");
    expect(scope.healthBasis.sources).toEqual(["HTTP check"]);
    const required = project([releaseObservation()], [deployment({ status: "failed" }), runtime()]);
    expect(buildProductionState(required).scopes[0].health.status).toBe("degraded");
  });

  it("C: keeps published, Unknown deployment and Not monitored separate", () => {
    const unknown = { ...deployment({ affects: false }), evidence: null };
    const scope = buildProductionState(project([releaseObservation()], [unknown])).scopes[0];
    expect(scope.releases[0].latestRelease.tagName).toBe("v1.1.1");
    expect(scope.deployments[0].serving).toBe("Unknown");
    expect(scope.deployments[0].latest).toBe("Unknown");
    expect(scope.health.status).toBe("not_monitored");
  });

  it("D: does not turn a serving deployment or Healthy runtime into a Release", () => {
    const value = project([releaseObservation(null)], [deployment(), runtime()]);
    value.tags = ["v0.1.0"];
    value.currentVersion = "v9.0.0";
    expect(html(value)).toContain("No published Release");
    expect(html(value)).not.toContain("v0.1.0");
    expect(html(value)).not.toContain("v9.0.0");
    expect(html(value)).not.toContain("/releases/tag/");
    expect(buildProductionState(value).scopes[0].health.status).toBe("healthy");
  });

  it("E: keeps Release/provider failure and Health Unknown instead of absence or Down", () => {
    const failed = { ...deployment(), status: "unknown", error: { code: "authentication_failed" }, evidence: null };
    const value = project([releaseObservation(null, null, true)], [failed]);
    const scope = buildProductionState(value).scopes[0];
    expect(scope.deployments[0]).toMatchObject({ state: "unavailable", serving: "Unknown", latest: "Unknown" });
    expect(scope.health.status).toBe("unknown");
    expect(html(value)).toContain("Release unavailable");
    expect(html(value)).toContain("Deployment unavailable");
    expect(html(value)).not.toContain("Not deployed");
  });

  it("F: preserves independent Desktop and Website facts and names the Health rollup", () => {
    const desktop = { id: "desktop", name: "Desktop" };
    const website = { id: "website", name: "Website" };
    const value = project(
      [releaseObservation("v0.4.0", desktop), releaseObservation("v1.2.0", website)],
      [deployment({ component: website }), runtime(website)], [desktop, website],
    );
    const state = buildProductionState(value);
    expect(state.scopes[0]).toMatchObject({ name: "Desktop", deployments: [], health: { status: "not_monitored" } });
    expect(state.scopes[1]).toMatchObject({ name: "Website", health: { status: "healthy" } });
    expect(state.scopes[1].deployments[0].serving).toBe("Active");
    expect(state.scopes[0].releases[0].latestRelease.tagName).toBe("v0.4.0");
    expect(state.scopes[1].releases[0].latestRelease.tagName).toBe("v1.2.0");
    const rendered = html(value);
    expect(rendered).toContain("Project Health:");
    expect(rendered.indexOf("Desktop")).toBeLessThan(rendered.indexOf("v0.4.0"));
    expect(rendered.indexOf("Website")).toBeLessThan(rendered.indexOf("v1.2.0"));
    expect(state).not.toHaveProperty("version");
    expect(state).not.toHaveProperty("deployment");
  });
});

describe("Deployment evidence limits", () => {
  it("never interprets the Railway latest-ID fallback as serving", () => {
    const observed = deployment({ active: false });
    expect(observed.evidence.activeDeploymentId).toBe("latest-B");
    expect(presentDeployment(observed, association)).toMatchObject({ serving: "No active deployment observed", servingId: null, latest: "Succeeded" });
  });

  it("retains a known latest attempt when the independent serving query is partial", () => {
    const observed = { ...deployment(), error: { code: "provider_partial" }, evidence: { latestDeploymentStatus: "failed" } };
    expect(presentDeployment(observed, association)).toMatchObject({ state: "partial", serving: "Unknown", latest: "Failed" });
    expect(html(project([releaseObservation()], [observed]))).toContain("Deployment information incomplete");
  });

  it("distinguishes a verified empty deployment observation from provider failure and an unconnected scope", () => {
    const empty = { ...deployment(), ...railwayServiceDeploymentHealth([]) };
    expect(presentDeployment(empty, association)).toMatchObject({ state: "not_deployed", serving: "Not deployed" });
    expect(html(project([releaseObservation()], [empty]))).toContain("Not deployed");
    expect(buildProductionState(project([releaseObservation()], [])).scopes[0].deployments).toEqual([]);
    expect(html(project([releaseObservation()], []))).toContain("Not connected");
  });

  it.each(["railway_deployment", "vercel_deployment"])("does not promote %s latest success into serving", (source) => {
    const observed = { ...deployment(), source, evidence: { deploymentId: "latest", deploymentStatus: "ready" } };
    expect(presentDeployment(observed)).toMatchObject({ serving: "Unknown", latest: "Succeeded" });
    expect(presentDeployment(observed).note).toContain("not independently observed");
    expect(presentDeployment(observed).servingLabel).toBe(source === "vercel_deployment" ? "Serving production" : "Active deployment");
  });

  it("never calls a staging association production", () => {
    expect(presentDeployment(deployment(), { metadata: { environmentName: "staging", isDeterministicProduction: true } })).toMatchObject({ servingLabel: "Active deployment", environment: "staging" });
  });

  it("disabled deployment observation stays Unknown, without implying Not deployed", () => {
    const observed = deployment();
    observed.monitor.enabled = false;
    expect(presentDeployment(observed, association)).toMatchObject({ state: "disabled", serving: "Unknown", latest: "Unknown", servingId: null, latestId: null });
  });

  it("does not derive deployment facts from Health, Release, or attention", () => {
    const value = project([releaseObservation()], [deployment()]);
    const baseline = buildProductionState(value).scopes[0].deployments;
    value.githubSummary.releases = summarizeProjectReleases(identity, [releaseObservation("unrelated-version")]);
    value.health.status = "down";
    value.health.observations[0].status = "down";
    value.attention = { needs_attention: true };
    expect(buildProductionState(value).scopes[0].deployments).toEqual(baseline);
  });

  it("deployment success cannot enable Health or imply independent HTTP checks", () => {
    const informational = project([releaseObservation()], [deployment({ affects: false })]);
    expect(buildProductionState(informational).scopes[0].health.status).toBe("not_monitored");
    const deploymentOnly = project([releaseObservation()], [deployment()]);
    expect(presentHealthBasis(deploymentOnly.health).note).toContain("no HTTP or database runtime check");
    expect(presentHealthBasis(deploymentOnly.health).sources).toEqual(["Railway deployment monitor"]);
  });
});

describe("Project state UI", () => {
  it("uses independent semantic labels, actual provenance and accessible Release navigation", () => {
    const value = project([releaseObservation()], [deployment(), runtime()]);
    const rendered = html(value);
    for (const label of ["Release", "Deployment", "Health"]) expect(rendered).toContain(`>${label}</dt>`);
    for (const label of ["Published version from GitHub", "Provider deployment evidence", "Runtime status from configured monitors", "Railway", "HTTP check", "Serving production", "Latest deployment attempt"]) expect(rendered).toContain(label);
    expect(rendered).toContain('href="/projects/example?tab=releases"');
    expect(rendered).toContain('href="https://github.com/example/app/releases/tag/v1.1.1"');
    expect(rendered).toContain("opens in a new tab");
  });

  it("preserves long scope/service names and partial Release evidence", () => {
    const component = { id: "web", name: "Very long component name ".repeat(15) };
    const value = project([releaseObservation("v1", component), releaseObservation(null, null, true)], [runtime(component)], [component]);
    expect(html(value)).toContain(component.name.trim());
    expect(html(value)).toContain("Release information incomplete");
    expect(html(value)).toContain("Project-level resources");
  });

  it("retains provider Component identity even when the local Component list is incomplete", () => {
    const component = { id: "web", name: "Website" };
    const value = project([releaseObservation("v1.2.0", component)], [runtime(component)]);
    expect(buildProductionState(value).scopes[0]).toMatchObject({ name: "Website", health: { status: "healthy" } });
    expect(html(value)).toContain('role="group" aria-label="Website"');
  });

  it("adds no provider requests or Release/deployment drift computation", () => {
    const source = readFileSync(new URL("../../lib/projects/production-state.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(|server-only|unstable_cache|process\.env/);
    expect(source).not.toMatch(/commitSha|tagSha|mismatch|drift|compareCommits/);
    const ui = readFileSync(new URL("../../components/workspace/production-state.js", import.meta.url), "utf8");
    expect(ui).not.toContain('"use client"');
  });
});
