import { chooseProjectAccent } from "./import-logic.js";
import {
  projectEditHref,
  projectWorkspaceHref,
} from "./navigation.js";

const LIFECYCLE_LABELS = {
  planning: "Planning",
  active: "Active",
  stable: "Stable",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

function validTimestamp(value) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function cleanOptionalText(value) {
  const text = value?.trim();
  return text || null;
}

export function summarizePortfolio(projects) {
  const activeCount = projects.filter(
    (project) => project.lifecycleState === "active",
  ).length;
  const attentionCount = projects.filter(
    (project) => project.needsAttention,
  ).length;
  const projectLabel = `${projects.length} ${projects.length === 1 ? "project" : "projects"}`;
  const attentionLabel =
    attentionCount === 1
      ? "1 needs attention"
      : `${attentionCount} need attention`;

  return {
    projectCount: projects.length,
    activeCount,
    attentionCount,
    label: `${projectLabel} · ${activeCount} active · ${attentionLabel}`,
  };
}

export function deriveProjectMark(name) {
  const parts = String(name ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return (parts[0] ?? "P").slice(0, 2).toUpperCase();
}

export function selectContinueProject(projects) {
  return projects.reduce((latest, project) => {
    const projectTimestamp = validTimestamp(project.lastWorkedAt);

    if (projectTimestamp == null) {
      return latest;
    }

    const latestTimestamp = validTimestamp(latest?.lastWorkedAt);
    return latestTimestamp == null || projectTimestamp > latestTimestamp
      ? project
      : latest;
  }, null);
}

export function formatRelativeTime(value, now = new Date()) {
  const timestamp = validTimestamp(value);

  if (timestamp == null) {
    return null;
  }

  const elapsedSeconds = Math.max(
    0,
    Math.round((now.getTime() - timestamp) / 1000),
  );

  if (elapsedSeconds < 60) {
    return "just now";
  }

  const units = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];

  for (const [unit, seconds] of units) {
    if (elapsedSeconds >= seconds) {
      const amount = Math.floor(elapsedSeconds / seconds);
      return `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
    }
  }

  return "just now";
}

export function normalizeProjectAccent(accent, name) {
  const hue = Number.parseFloat(accent);

  if (Number.isFinite(hue) && hue >= 0 && hue <= 360) {
    return String(hue);
  }

  return chooseProjectAccent(name);
}

export function buildProjectCardViewModel(project, now = new Date()) {
  const lastWorkedLabel = formatRelativeTime(project.lastWorkedAt, now);
  const issueSummary = project.githubSummary?.issues?.label
    ? {
        label: project.githubSummary.issues.label,
        status: project.githubSummary.issues.status,
        description:
          project.githubSummary.issues.status === "partial"
            ? `${project.githubSummary.issues.checkedRepositoryCount} of ${project.githubSummary.repositoryCount} repositories checked`
            : project.githubSummary.issues.status === "unavailable"
              ? "Connected repositories could not be checked"
              : null,
      }
    : null;
  const releaseSummary = project.githubSummary?.releases?.compactLabel
    ? { label: project.githubSummary.releases.compactLabel }
    : null;
  const recentActivity = project.githubSummary?.activity?.items?.[0]
    ? {
        message: project.githubSummary.activity.items[0].message,
        committedAt: project.githubSummary.activity.items[0].committedAt,
      }
    : null;

  return {
    id: project.id,
    slug: project.slug,
    workspaceHref: projectWorkspaceHref(project.slug),
    editHref: projectEditHref(project.slug),
    name: project.name,
    mark: deriveProjectMark(project.name),
    tagline: cleanOptionalText(project.tagline),
    lifecycleState: project.lifecycleState,
    lifecycleLabel:
      LIFECYCLE_LABELS[project.lifecycleState] ?? project.lifecycleState,
    needsAttention: Boolean(project.needsAttention),
    attentionSummary: cleanOptionalText(project.attentionSummary),
    nextAction: cleanOptionalText(project.nextAction),
    accentHue: normalizeProjectAccent(project.accent, project.name),
    components: (project.components ?? []).map(({ id, name }) => ({ id, name })),
    issueSummary,
    releaseSummary,
    recentActivity,
    lastWorkedAt: project.lastWorkedAt,
    lastWorkedLabel,
    lastMeaningfulWorkSummary: cleanOptionalText(
      project.lastMeaningfulWorkSummary,
    ),
    hasLastWork: Boolean(
      lastWorkedLabel || cleanOptionalText(project.lastMeaningfulWorkSummary),
    ),
  };
}

export function buildProjectNextPresentation(card) {
  return card.nextAction
    ? {
        isSet: true,
        label: card.nextAction,
        editHref: null,
      }
    : {
        isSet: false,
        label: "No next action set",
        editHref: card.editHref,
      };
}

export function buildPortfolioViewModel(projects, now = new Date()) {
  const continueProject = selectContinueProject(projects);

  return {
    summary: summarizePortfolio(projects),
    cards: projects.map((project) =>
      buildProjectCardViewModel(project, now),
    ),
    continueCard: continueProject
      ? buildProjectCardViewModel(continueProject, now)
      : null,
  };
}

export function filterProjectCards(
  cards,
  { query = "", lifecycle = "all", attentionOnly = false } = {},
) {
  const needle = query.trim().toLowerCase();

  return cards.filter((card) => {
    const searchable = [
      card.name,
      card.tagline,
      ...(card.components ?? []).map(({ name }) => name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      (!needle || searchable.includes(needle)) &&
      (lifecycle === "all" || card.lifecycleState === lifecycle) &&
      (!attentionOnly || card.needsAttention)
    );
  });
}
