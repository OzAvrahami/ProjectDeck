import { PROJECT_PHASE_OVERRIDES } from "../../db/schema.js";
import { PROJECT_ACCENTS } from "./import-logic.js";

export const PROJECT_EDIT_LIMITS = {
  name: 160,
  tagline: 240,
  attentionSummary: 500,
  nextAction: 500,
};

export const PROJECT_PHASE_OPTIONS = [
  { value: "", label: "Automatic" },
  ...PROJECT_PHASE_OVERRIDES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })),
];

export const PROJECT_NEXT_MODE_OPTIONS = [
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual override" },
];

export const PROJECT_ATTENTION_MODE_OPTIONS = [
  { value: "automatic", label: "Automatic" },
  { value: "force", label: "Force Needs Attention" },
];

export const PROJECT_ACCENT_OPTIONS = [
  { value: PROJECT_ACCENTS[0], label: "Indigo" },
  { value: PROJECT_ACCENTS[1], label: "Magenta" },
  { value: PROJECT_ACCENTS[2], label: "Green" },
  { value: PROJECT_ACCENTS[3], label: "Lime" },
  { value: PROJECT_ACCENTS[4], label: "Cyan" },
  { value: PROJECT_ACCENTS[5], label: "Orange" },
];

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanOptionalText(value) {
  return cleanText(value) || null;
}

function exceedsLimit(value, limit) {
  return value != null && value.length > limit;
}

export function validateProjectEdit(input) {
  const requestedAttentionMode = cleanOptionalText(input.attentionMode);
  const attentionMode = requestedAttentionMode ??
    (input.needsAttention === true || input.needsAttention === "on"
      ? "force"
      : "automatic");
  const needsAttention = attentionMode === "force";
  const cleanedNextAction = cleanOptionalText(input.nextAction);
  const requestedNextMode = cleanOptionalText(input.nextActionMode);
  const nextActionMode = requestedNextMode
    ? requestedNextMode === "manual" && cleanedNextAction
      ? "manual"
      : requestedNextMode === "automatic" ||
          (requestedNextMode === "manual" && !cleanedNextAction)
        ? "automatic"
        : requestedNextMode
    : cleanedNextAction
      ? "manual"
      : "automatic";
  const values = {
    name: cleanText(input.name),
    tagline: cleanText(input.tagline),
    phaseOverride: cleanOptionalText(input.phaseOverride),
    attentionMode,
    needsAttention,
    attentionSummary: needsAttention
      ? cleanOptionalText(input.attentionSummary)
      : null,
    nextActionMode,
    nextAction: nextActionMode === "manual" ? cleanedNextAction : null,
    accent: cleanText(input.accent),
  };
  const errors = {};

  if (!values.name) {
    errors.name = "Project name is required.";
  } else if (exceedsLimit(values.name, PROJECT_EDIT_LIMITS.name)) {
    errors.name = `Project name must be ${PROJECT_EDIT_LIMITS.name} characters or fewer.`;
  }

  if (exceedsLimit(values.tagline, PROJECT_EDIT_LIMITS.tagline)) {
    errors.tagline = `Tagline must be ${PROJECT_EDIT_LIMITS.tagline} characters or fewer.`;
  }

  if (
    values.phaseOverride !== null &&
    !PROJECT_PHASE_OVERRIDES.includes(values.phaseOverride)
  ) {
    errors.phaseOverride = "Choose Automatic or a valid Project phase.";
  }

  if (!PROJECT_ATTENTION_MODE_OPTIONS.some(({ value }) => value === attentionMode)) {
    errors.attentionMode = "Choose Automatic or Force Needs Attention.";
  }

  if (
    exceedsLimit(
      values.attentionSummary,
      PROJECT_EDIT_LIMITS.attentionSummary,
    )
  ) {
    errors.attentionSummary = `Attention summary must be ${PROJECT_EDIT_LIMITS.attentionSummary} characters or fewer.`;
  }

  if (exceedsLimit(values.nextAction, PROJECT_EDIT_LIMITS.nextAction)) {
    errors.nextAction = `Next action must be ${PROJECT_EDIT_LIMITS.nextAction} characters or fewer.`;
  }

  if (!PROJECT_NEXT_MODE_OPTIONS.some(({ value }) => value === nextActionMode)) {
    errors.nextActionMode = "Choose Automatic or Manual override.";
  }

  if (!PROJECT_ACCENTS.includes(values.accent)) {
    errors.accent = "Choose a ProjectDeck accent.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    values,
    errors,
  };
}
