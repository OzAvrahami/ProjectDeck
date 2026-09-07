import "server-only";

import { deflateRawSync, inflateRawSync } from "node:zlib";

import { DEFAULT_ISSUE_PAGE_SIZE } from "../github/issues.js";

const MAX_CURSOR_LENGTH = 24_000;
const MAX_CURSOR_JSON_BYTES = 128_000;

function safeCursorKey(key) {
  return (
    key.length > 0 &&
    key.length <= 300 &&
    !["__proto__", "prototype", "constructor"].includes(key)
  );
}

function emptyState(type) {
  return { version: 1, type, positions: {}, history: [], offset: 0 };
}

function validStringMap(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, cursor]) =>
        safeCursorKey(key) &&
        typeof cursor === "string" &&
        cursor.length > 0 &&
        cursor.length <= 1_000,
    );
}

function validHistory(history) {
  return Array.isArray(history) && history.length <= 500 && history.every(
    (entry) =>
      Number.isSafeInteger(entry?.offset) &&
      entry.offset >= 0 &&
      entry.changes &&
      typeof entry.changes === "object" &&
      !Array.isArray(entry.changes) &&
      Object.entries(entry.changes).every(
        ([key, cursor]) =>
          safeCursorKey(key) &&
          (cursor === null ||
            (typeof cursor === "string" && cursor.length <= 1_000)),
      ),
  );
}

export function decodeIssuePageCursor(value, type = "all") {
  const normalizedType = type === "bug" ? "bug" : "all";

  if (!value) {
    return { state: emptyState(normalizedType), invalid: false };
  }

  if (typeof value !== "string" || value.length > MAX_CURSOR_LENGTH) {
    return { state: emptyState(normalizedType), invalid: true };
  }

  try {
    const json = inflateRawSync(Buffer.from(value, "base64url"), {
      maxOutputLength: MAX_CURSOR_JSON_BYTES,
    }).toString("utf8");
    const parsed = JSON.parse(json);

    if (
      parsed?.version !== 1 ||
      parsed.type !== normalizedType ||
      !validStringMap(parsed.positions) ||
      !validHistory(parsed.history) ||
      !Number.isSafeInteger(parsed.offset) ||
      parsed.offset < 0
    ) {
      throw new Error("Invalid Issue cursor.");
    }

    return { state: parsed, invalid: false };
  } catch {
    return { state: emptyState(normalizedType), invalid: true };
  }
}

export function encodeIssuePageCursor(state) {
  return deflateRawSync(Buffer.from(JSON.stringify(state))).toString(
    "base64url",
  );
}

export function issueObservationKey(observation) {
  return `${observation.projectId}:${observation.repository.fullName.toLowerCase()}`;
}

function newestIssueFirst(left, right) {
  const leftTime = Date.parse(left.item.updatedAt ?? "") || 0;
  const rightTime = Date.parse(right.item.updatedAt ?? "") || 0;
  const repositoryOrder = left.item.repository.fullName.localeCompare(
    right.item.repository.fullName,
  );

  return (
    rightTime - leftTime ||
    (left.observationKey === right.observationKey
      ? left.providerIndex - right.providerIndex
      : repositoryOrder) ||
    left.item.number - right.item.number ||
    left.projectSlug.localeCompare(right.projectSlug)
  );
}

function issueIdentity(record) {
  return record.item.id
    ? `github:${record.item.id}`
    : `${record.item.repository.fullName.toLowerCase()}#${record.item.number}`;
}

function previousState(state) {
  const history = state.history.slice();
  const previous = history.pop();

  if (!previous) return null;

  const positions = { ...state.positions };

  for (const [key, cursor] of Object.entries(previous.changes)) {
    if (cursor === null) delete positions[key];
    else positions[key] = cursor;
  }

  return {
    ...state,
    positions,
    history,
    offset: previous.offset,
  };
}

export function composeIssuePage({
  observations,
  projects,
  state,
  invalidCursor = false,
  type = "all",
  pageSize = DEFAULT_ISSUE_PAGE_SIZE,
}) {
  const contextualItems = new Map(
    projects.flatMap((project) =>
      (project.githubSummary?.issues.items ?? []).map((item) => [
        `${project.id}:${item.id}`,
        item,
      ]),
    ),
  );
  const successes = observations.filter(
    (observation) => observation.issues.status === "success",
  );
  const failures = observations.filter(
    (observation) => observation.issues.status === "unavailable",
  );
  const records = successes
    .flatMap((observation) =>
      observation.issues.edges.map((edge, providerIndex) => ({
        ...edge,
        item:
          contextualItems.get(`${observation.projectId}:${edge.item.id}`) ??
          edge.item,
        observationKey: issueObservationKey(observation),
        providerIndex,
        projectSlug:
          projects.find(({ id }) => id === observation.projectId)?.slug ?? "",
      })),
    )
    .sort(newestIssueFirst);
  const unique = [];
  const seen = new Set();

  for (const record of records) {
    const identity = issueIdentity(record);
    if (seen.has(identity)) continue;
    seen.add(identity);
    unique.push(record);
  }

  const selected = unique.slice(0, pageSize);
  const status = observations.length === 0
    ? "not_connected"
    : successes.length === observations.length
      ? "complete"
      : successes.length > 0
        ? "partial"
        : "unavailable";
  const changes = {};
  const nextPositions = { ...state.positions };

  for (const record of selected) {
    if (!(record.observationKey in changes)) {
      changes[record.observationKey] =
        state.positions[record.observationKey] ?? null;
    }
    nextPositions[record.observationKey] = record.cursor;
  }

  const providerHasMore = successes.some((observation) => {
    const selectedForRepository = selected.filter(
      (record) => record.observationKey === issueObservationKey(observation),
    ).length;
    return (
      selectedForRepository < observation.issues.edges.length ||
      observation.issues.pageInfo.hasNextPage
    );
  });
  const hasNextPage =
    status === "complete" && selected.length > 0 && providerHasMore;
  const hasPreviousPage = status === "complete" && state.history.length > 0;
  const nextState = hasNextPage
    ? {
        ...state,
        positions: nextPositions,
        history: [
          ...state.history,
          { changes, offset: state.offset },
        ],
        offset: state.offset + selected.length,
      }
    : null;
  const priorState = hasPreviousPage ? previousState(state) : null;
  const filteredTotalCount = successes.reduce(
    (total, observation) =>
      total + observation.issues.filteredTotalCount,
    0,
  );

  return {
    items: selected.map(({ item }) => item),
    status,
    type: type === "bug" ? "bug" : "all",
    pageSize,
    filteredTotalCount,
    visibleStart: selected.length > 0 ? state.offset + 1 : 0,
    visibleEnd: state.offset + selected.length,
    hasNextPage,
    hasPreviousPage,
    nextCursor: nextState ? encodeIssuePageCursor(nextState) : null,
    previousCursor: priorState ? encodeIssuePageCursor(priorState) : null,
    invalidCursor,
    checkedAt:
      observations
        .map(({ checkedAt }) => checkedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    checkedRepositoryCount: successes.length,
    failedRepositoryCount: failures.length,
  };
}
