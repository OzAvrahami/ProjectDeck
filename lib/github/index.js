import "server-only";

export function isGitHubConfigured() {
  return Boolean(process.env.GITHUB_TOKEN);
}
