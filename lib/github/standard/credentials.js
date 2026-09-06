import "server-only";

export const GITHUB_STANDARD_PROJECTS_WRITE_ENVIRONMENT_VARIABLE =
  "GITHUB_STANDARD_PROJECTS_WRITE_TOKEN";
export const GITHUB_STANDARD_REPOSITORY_WRITE_ENVIRONMENT_VARIABLE =
  "GITHUB_STANDARD_REPOSITORY_WRITE_TOKEN";

function credential(environment, name) {
  const value = String(environment[name] ?? "").trim();
  return value || null;
}

export function getGitHubStandardWriteCapabilities(environment = process.env) {
  return {
    projects: Boolean(
      credential(environment, GITHUB_STANDARD_PROJECTS_WRITE_ENVIRONMENT_VARIABLE),
    ),
    repository: Boolean(
      credential(environment, GITHUB_STANDARD_REPOSITORY_WRITE_ENVIRONMENT_VARIABLE),
    ),
  };
}

export function requireGitHubStandardProjectsWriteToken(
  environment = process.env,
) {
  return credential(
    environment,
    GITHUB_STANDARD_PROJECTS_WRITE_ENVIRONMENT_VARIABLE,
  );
}

export function requireGitHubStandardRepositoryWriteToken(
  environment = process.env,
) {
  return credential(
    environment,
    GITHUB_STANDARD_REPOSITORY_WRITE_ENVIRONMENT_VARIABLE,
  );
}
