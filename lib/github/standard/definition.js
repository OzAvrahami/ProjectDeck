import {
  STANDARD_PROJECT_PRIORITIES,
  STANDARD_PROJECT_STATUSES,
} from "../projects-v2.js";

export const GITHUB_DEVELOPMENT_STANDARD_VERSION = "v1";

export { STANDARD_PROJECT_PRIORITIES, STANDARD_PROJECT_STATUSES };

export const STANDARD_PRIMARY_TYPE_LABELS = [
  "bug",
  "feature",
  "enhancement",
  "chore",
  "documentation",
];

export const STANDARD_META_LABELS = [
  "duplicate",
  "invalid",
  "wontfix",
];

export const STANDARD_REPOSITORY_LABELS = [
  ...STANDARD_PRIMARY_TYPE_LABELS,
  ...STANDARD_META_LABELS,
];

export const STANDARD_PROJECT_VIEWS = [
  { name: "Development", layout: "BOARD_LAYOUT", groupBy: "Status" },
  { name: "All work", layout: "TABLE_LAYOUT", groupBy: null },
];

export const STANDARD_RELEASE_TAG_PATTERN =
  /^v\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?$/;

export const STANDARD_PROJECT_FIELDS = {
  Status: STANDARD_PROJECT_STATUSES,
  Priority: STANDARD_PROJECT_PRIORITIES,
};

export const STANDARD_CHANGE_CLASSIFICATIONS = [
  "conformant",
  "safe_change",
  "manual_required",
  "unsupported",
  "blocked",
  "unknown",
];

export const NEUTRAL_GITHUB_LABEL_COLOR = "EDEDED";
export const NEUTRAL_PROJECT_OPTION_COLOR = "GRAY";

export const STANDARD_WRITE_CAPABILITY_BY_ACTION = {
  create_project_single_select_field: "projects",
  create_repository_label: "repository",
};
