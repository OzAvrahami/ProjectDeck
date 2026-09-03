export const PROJECT_SECTIONS = [
  "Overview",
  "Projects",
  "Activity",
  "Releases",
  "Issues",
];

export const ADD_PROJECTS_HREF = "/setup/github";

export function projectWorkspaceHref(slug) {
  return `/projects/${encodeURIComponent(slug)}`;
}

export function projectEditHref(slug) {
  return `${projectWorkspaceHref(slug)}/edit`;
}

export function projectIssuesHref(slug, { type = "all" } = {}) {
  const href = `${projectWorkspaceHref(slug)}?tab=issues`;
  return type === "bug" ? `${href}&type=bug` : href;
}

export function projectReleasesHref(slug) {
  return `${projectWorkspaceHref(slug)}?tab=releases`;
}

export const PORTFOLIO_NAVIGATION = [
  { label: "Overview", href: "/", enabled: true },
  { label: "Projects", href: "/projects", enabled: true },
  { label: "Activity", href: "/activity", enabled: true },
  { label: "Releases", href: "/releases", enabled: true },
  { label: "Issues", href: "/issues", enabled: true },
];

export const WORKSPACE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "issues", label: "Issues" },
  { id: "releases", label: "Releases" },
  { id: "activity", label: "Activity" },
  { id: "docs", label: "Docs" },
];
