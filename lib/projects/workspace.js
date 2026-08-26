const DOC_RESOURCE_TYPES = new Set([
  "doc",
  "docs",
  "document",
  "documentation",
]);

function providerName(provider) {
  if (!provider) {
    return null;
  }

  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function listDocumentationResources(resources) {
  return resources.filter((resource) =>
    DOC_RESOURCE_TYPES.has(resource.resourceType.toLowerCase()),
  );
}

export function buildQuickLinks(resources) {
  return resources.map((resource) => {
    let label = resource.label;

    if (resource.provider === "github") {
      label = resource.componentName
        ? `GitHub — ${resource.componentName}`
        : resource.label;
    } else if (resource.provider === "railway") {
      label = resource.componentName
        ? `Railway — ${resource.componentName}`
        : resource.label;
    }

    return {
      id: resource.id,
      label,
      url: resource.url,
      context:
        providerName(resource.provider) ??
        resource.resourceType.replaceAll("_", " "),
    };
  });
}
