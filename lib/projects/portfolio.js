import { chooseProjectAccent } from "./import-logic.js";
import {
  projectEditHref,
  projectIssuesHref,
  projectReleasesHref,
  projectWorkspaceHref,
} from "./navigation.js";
import { inferProjectNextAction } from "./next-action.js";
import { PROJECT_PHASE_LABELS } from "./phase.js";

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

function projectAttention(project) {
  if (project.attention) return project.attention;
  if (project.needsAttention) {
    const reason = cleanOptionalText(project.attentionSummary) ??
      "Manual attention override";
    return {
      needs_attention: true,
      source: "manual",
      severity: "normal",
      primary_reason: reason,
      reasons: [],
    };
  }
  return {
    needs_attention: false,
    source: "none",
    severity: "normal",
    primary_reason: "No current high-confidence attention signals",
    reasons: [],
  };
}

export function summarizePortfolio(projects) {
  const developmentCount = projects.filter(
    (project) => project.phase?.phase === "development",
  ).length;
  const attentionCount = projects.filter(
    (project) => projectAttention(project).needs_attention,
  ).length;
  const projectLabel = `${projects.length} ${projects.length === 1 ? "project" : "projects"}`;
  const attentionLabel =
    attentionCount === 1
      ? "1 needs attention"
      : `${attentionCount} need attention`;

  return {
    projectCount: projects.length,
    developmentCount,
    attentionCount,
    label: `${projectLabel} · ${developmentCount} in development · ${attentionLabel}`,
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
  const attention = projectAttention(project);
  const next =
    project.next ??
    inferProjectNextAction({
      manualOverride: project.nextAction,
      projectResolution: null,
      project,
    });
  const lastWorkedLabel = formatRelativeTime(project.lastWorkedAt, now);
  const issueSummary = project.githubSummary?.issues?.label
    ? {
        label: project.githubSummary.issues.label,
        openIssueCount: project.githubSummary.issues.openIssueCount,
        openBugCount: project.githubSummary.issues.openBugCount,
        status: project.githubSummary.issues.status,
        segments: project.githubSummary.issues.openLabel
          ? [
              project.githubSummary.issues.bugLabel
                ? {
                    key: "bugs",
                    label: project.githubSummary.issues.bugLabel,
                    href: projectIssuesHref(project.slug, { type: "bug" }),
                  }
                : null,
              {
                key: "open",
                label: project.githubSummary.issues.openLabel,
                href: projectIssuesHref(project.slug),
              },
            ].filter(Boolean)
          : [
              {
                key: "unavailable",
                label: project.githubSummary.issues.label,
                href: projectIssuesHref(project.slug),
              },
            ],
        description:
          project.githubSummary.issues.status === "partial"
            ? `${project.githubSummary.issues.checkedRepositoryCount} of ${project.githubSummary.repositoryCount} repositories checked`
            : project.githubSummary.issues.status === "unavailable"
              ? "Connected repositories could not be checked"
              : null,
      }
    : null;
  const releaseLabel =
    project.githubSummary?.releases?.safeCardLabel ??
    project.githubSummary?.releases?.compactLabel;
  const releaseSummary = releaseLabel
    ? {
        label: releaseLabel,
        href: projectReleasesHref(project.slug),
        state: project.githubSummary.releases.state ?? "exact",
        description:
          project.githubSummary.releases.state === "partial"
            ? "Published GitHub Release information is incomplete"
            : project.githubSummary.releases.state === "unavailable"
              ? "Published GitHub Release information is unavailable"
              : "Published GitHub Release evidence",
      }
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
    phase: project.phase?.phase ?? "unknown",
    phaseLabel: project.phase?.label ?? PROJECT_PHASE_LABELS.unknown,
    phaseSource: project.phase?.source ?? "unknown",
    phaseReason:
      project.phase?.reason ?? "Project phase evidence is unavailable",
    health: project.health ?? {
      status: "not_monitored",
      label: "Not monitored",
      reason: "No enabled monitors affect Project Health.",
      monitorCount: 0,
      affectingMonitorCount: 0,
      observations: [],
    },
    attention,
    needsAttention: attention.needs_attention,
    attentionSummary: attention.primary_reason,
    next,
    nextAction: next.action,
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
  const next = card.next;

  if (next.source === "manual") {
    return {
      isSet: true,
      label: next.action,
      source: "manual",
      isManual: true,
      issueUrl: null,
      metaLabel: null,
      reason: next.reason,
    };
  }

  if (next.source === "inferred") {
    const compactPriority = next.priority?.split(" ")[0] ?? null;
    const context = [
      next.contextLabel,
      next.issueNumber ? `#${next.issueNumber}` : null,
      compactPriority,
      next.status,
    ].filter(Boolean);

    return {
      isSet: true,
      label: next.action,
      source: "inferred",
      isManual: false,
      issueUrl: next.issueUrl,
      metaLabel: context.join(" · "),
      reason: next.reason,
    };
  }

  return {
    isSet: false,
    label: next.source === "none" ? "No clear next action" : "Unavailable",
    source: next.source,
    isManual: false,
    issueUrl: null,
    metaLabel: null,
    reason: next.reason,
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
  { query = "", phase = "all", attentionOnly = false } = {},
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
      (phase === "all" || card.phase === phase) &&
      (!attentionOnly || card.needsAttention)
    );
  });
}
