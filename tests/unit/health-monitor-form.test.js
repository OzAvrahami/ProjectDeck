import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  fileURLToPath(new URL("../../components/workspace/health-monitor-form.js", import.meta.url)),
  "utf8",
);
const workspaceSource = readFileSync(
  fileURLToPath(new URL("../../components/workspace/project-workspace.js", import.meta.url)),
  "utf8",
);

describe("new Health monitor choices", () => {
  it("offers only None, HTTP endpoint, and PostgreSQL", () => {
    const options = [...formSource.matchAll(/<option(?:\s+value="([^"]+)")?>([^<]+)<\/option>/g)]
      .map(([, value, label]) => ({ value: value ?? label, label }));

    expect(options).toEqual(expect.arrayContaining([
      { value: "none", label: "None" },
      { value: "http", label: "HTTP endpoint" },
      { value: "postgres", label: "PostgreSQL" },
    ]));
    expect(options.some(({ value }) => value === "vercel_deployment")).toBe(false);
    expect(formSource).not.toContain("vercelProjectId");
    expect(formSource).not.toContain("vercelTeamId");
  });

  it("labels existing manual Vercel observations as legacy and deprecated", () => {
    expect(workspaceSource).toContain("Legacy / deprecated manual Vercel monitor");
  });
});
