import "server-only";

import {
  fetchLatestRailwayDeployment,
  parseRailwayResource,
  RailwayProviderError,
  railwayDeploymentLabel,
} from "../railway/index.js";

function unavailable(error) {
  return {
    status: "unavailable",
    error: {
      code: error instanceof RailwayProviderError ? error.code : "provider",
      message:
        error instanceof RailwayProviderError
          ? error.message
          : "Railway returned an unexpected provider response.",
    },
  };
}

export async function observeProjectRailway(
  project,
  { token = process.env.RAILWAY_TOKEN, fetchImpl = fetch, now = new Date() } = {},
) {
  const resources = project.railwayResources ?? [];
  const checkedAt = now.toISOString();
  const results = await Promise.all(
    resources.map(async (resource) => {
      const identity = parseRailwayResource(resource);
      const base = {
        resource,
        componentName: resource.componentName,
        checkedAt,
      };

      if (!identity) {
        return {
          ...base,
          ...unavailable(
            new RailwayProviderError(
              "invalid_identity",
              "The Railway resource identity is incomplete.",
            ),
          ),
        };
      }

      try {
        const deployment = await fetchLatestRailwayDeployment(identity, {
          token,
          fetchImpl,
        });
        return {
          ...base,
          status: "success",
          deployment,
          label: deployment
            ? railwayDeploymentLabel(deployment.status)
            : "No deployments found",
        };
      } catch (error) {
        return { ...base, ...unavailable(error) };
      }
    }),
  );

  return {
    status:
      resources.length === 0
        ? "not_connected"
        : results.every((result) => result.status === "success")
          ? "complete"
          : results.some((result) => result.status === "success")
            ? "partial"
            : "unavailable",
    checkedAt: resources.length > 0 ? checkedAt : null,
    items: results,
  };
}
