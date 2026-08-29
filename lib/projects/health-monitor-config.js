export const HEALTH_MONITOR_TYPES = [
  "railway_deployment",
  "vercel_deployment",
  "http",
  "postgres",
];

const ENVIRONMENT_NAME = /^[A-Z][A-Z0-9_]*$/;

function text(value, maxLength = 255) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function validateHealthMonitorInput(input, project) {
  const monitorType = text(input.monitorType, 80);
  const label = text(input.label, 160);
  const componentId = text(input.componentId, 80) || null;
  const affectsProjectHealth = input.affectsProjectHealth !== "false";
  const errors = {};

  if (!HEALTH_MONITOR_TYPES.includes(monitorType)) {
    errors.monitorType = "Choose a supported monitor type.";
  }
  if (!label) errors.label = "A monitor label is required.";
  if (
    componentId &&
    !(project.components ?? []).some((component) => component.id === componentId)
  ) {
    errors.componentId = "Choose a Component belonging to this Project.";
  }

  let resource = null;
  let configuration = {};

  if (monitorType === "railway_deployment") {
    const existingResourceId = text(input.existingResourceId, 80) || null;
    if (existingResourceId) {
      const existing = (project.railwayResources ?? []).find(
        (candidate) => candidate.id === existingResourceId,
      );
      if (!existing) {
        errors.existingResourceId = "Choose a connected Railway resource.";
      } else {
        resource = existing;
      }
    } else {
      const railwayProjectId = text(input.railwayProjectId);
      const environmentId = text(input.environmentId);
      const serviceId = text(input.serviceId);
      if (!railwayProjectId || !environmentId || !serviceId) {
        errors.railway =
          "Railway project, environment, and service IDs are required.";
      } else {
        resource = {
          resourceType: "service",
          label,
          provider: "railway",
          externalId: `${railwayProjectId}:${environmentId}:${serviceId}`,
          url: `https://railway.com/project/${encodeURIComponent(railwayProjectId)}/service/${encodeURIComponent(serviceId)}?environmentId=${encodeURIComponent(environmentId)}`,
        };
      }
    }
  }

  if (monitorType === "vercel_deployment") {
    const projectId = text(input.vercelProjectId);
    const teamId = text(input.vercelTeamId) || null;
    if (!projectId) errors.vercelProjectId = "Vercel Project ID is required.";
    configuration = { projectId, ...(teamId ? { teamId } : {}) };
    resource = {
      resourceType: "deployment",
      label,
      provider: "vercel",
      externalId: projectId || null,
      url: "https://vercel.com/dashboard",
    };
  }

  if (monitorType === "http") {
    const url = safeHttpUrl(input.httpUrl);
    const method = text(input.httpMethod, 8).toUpperCase() || "GET";
    if (!url) errors.httpUrl = "Enter an explicit HTTP or HTTPS health URL.";
    if (!["GET", "HEAD"].includes(method)) {
      errors.httpMethod = "Choose GET or HEAD.";
    }
    configuration = { url, method };
  }

  if (monitorType === "postgres") {
    const connectionEnvVar = text(input.connectionEnvVar, 160);
    if (!ENVIRONMENT_NAME.test(connectionEnvVar)) {
      errors.connectionEnvVar =
        "Use an uppercase server environment-variable name.";
    }
    configuration = { connectionEnvVar };
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: {
      label,
      monitorType,
      componentId,
      enabled: true,
      affectsProjectHealth,
      configuration,
      resource,
    },
  };
}

