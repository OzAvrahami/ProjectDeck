export function buildIntegrationStatus({
  resources = [],
  githubConfigured = false,
  railwayConfigured = false,
  connectionsAvailable = true,
} = {}) {
  const githubRepositoryCount = resources.filter(
    (resource) =>
      resource.provider === "github" &&
      resource.resourceType === "repository",
  ).length;
  const railwayResourceCount = resources.filter(
    (resource) => resource.provider === "railway",
  ).length;

  return {
    github: {
      configured: Boolean(githubConfigured),
      connectedCount: connectionsAvailable ? githubRepositoryCount : null,
    },
    railway: {
      configured: Boolean(railwayConfigured),
      connectedCount: connectionsAvailable ? railwayResourceCount : null,
    },
    connectionsAvailable: Boolean(connectionsAvailable),
  };
}

export function connectedResourceLabel(count, singular, plural = null) {
  if (count == null) {
    return "Connection count unavailable";
  }

  const pluralLabel =
    plural ??
    (singular.endsWith("y")
      ? `${singular.slice(0, -1)}ies`
      : `${singular}s`);

  return `${count} connected ${count === 1 ? singular : pluralLabel}`;
}
