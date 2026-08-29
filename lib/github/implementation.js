import "server-only";

import {
  encodeGitHubRepositoryPath,
  fetchGitHubJson,
} from "./client.js";

export const IMPLEMENTATION_ACTIVITY_DAYS = 21;
export const MAX_IMPLEMENTATION_COMMITS = 6;
export const MAX_REPOSITORY_TREE_ENTRIES = 5_000;

const IMPLEMENTATION_EXTENSIONS = new Set([
  "c",
  "cc",
  "clj",
  "cljs",
  "cpp",
  "cs",
  "css",
  "cxx",
  "dart",
  "ex",
  "exs",
  "fs",
  "fsx",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "jsx",
  "kt",
  "kts",
  "less",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "sass",
  "scala",
  "scss",
  "sql",
  "svelte",
  "swift",
  "ts",
  "tsx",
  "vue",
]);

const EXCLUDED_DIRECTORIES = new Set([
  ".github",
  ".next",
  ".vscode",
  "assets",
  "build",
  "coverage",
  "design-reference",
  "dist",
  "docs",
  "documentation",
  "fixtures",
  "generated",
  "node_modules",
  "scripts",
  "spec",
  "specs",
  "test",
  "tests",
  "vendor",
]);

const EXCLUDED_FILES = new Set([
  "drizzle.config.js",
  "eslint.config.js",
  "next.config.js",
  "playwright.config.js",
  "postcss.config.js",
  "tailwind.config.js",
  "vite.config.js",
  "vitest.config.js",
]);

const COMMON_SCAFFOLD_FILES = new Set([
  "app/globals.css",
  "app/layout.js",
  "app/layout.jsx",
  "app/layout.tsx",
  "app/page.js",
  "app/page.jsx",
  "app/page.tsx",
  "index.html",
  "pages/index.js",
  "pages/index.jsx",
  "pages/index.tsx",
  "src/app/globals.css",
  "src/app/layout.js",
  "src/app/layout.jsx",
  "src/app/layout.tsx",
  "src/app/page.js",
  "src/app/page.jsx",
  "src/app/page.tsx",
  "src/app.jsx",
  "src/app.tsx",
  "src/main.jsx",
  "src/main.tsx",
]);

const NON_IMPLEMENTATION_EXTENSIONS = new Set([
  "adoc",
  "csv",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "json",
  "lock",
  "md",
  "mdx",
  "pdf",
  "png",
  "rst",
  "svg",
  "toml",
  "txt",
  "webp",
  "yaml",
  "yml",
]);

const NON_IMPLEMENTATION_DIRECTORIES = new Set([
  ".github",
  "design-reference",
  "docs",
  "documentation",
  "spec",
  "specs",
]);

function normalizedPath(value) {
  return String(value ?? "").replaceAll("\\", "/").toLowerCase();
}

function extension(path) {
  const name = path.split("/").at(-1) ?? "";
  const separator = name.lastIndexOf(".");
  return separator > 0 ? name.slice(separator + 1) : "";
}

function isConfigurationFile(path) {
  const name = path.split("/").at(-1) ?? "";
  return (
    EXCLUDED_FILES.has(name) ||
    /(?:^|\.)(?:config|rc)\.(?:c?js|mjs|ts|tsx)$/.test(name) ||
    /(?:^|\.)(?:test|spec)\.[^.]+$/.test(name)
  );
}

export function isMeaningfulImplementationPath(value) {
  const path = normalizedPath(value);

  if (!path || isConfigurationFile(path)) {
    return false;
  }

  const segments = path.split("/");

  if (segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) {
    return false;
  }

  return IMPLEMENTATION_EXTENSIONS.has(extension(path));
}

function isKnownNonImplementationPath(value) {
  const path = normalizedPath(value);
  const segments = path.split("/");
  const name = segments.at(-1) ?? "";

  return (
    segments.some((segment) => NON_IMPLEMENTATION_DIRECTORIES.has(segment)) ||
    NON_IMPLEMENTATION_EXTENSIONS.has(extension(path)) ||
    isConfigurationFile(path) ||
    name.startsWith("readme") ||
    name.startsWith("license") ||
    name === ".gitignore" ||
    name === ".gitattributes" ||
    name === ".editorconfig" ||
    name === "package.json"
  );
}

export function classifyRepositoryTree(
  entries,
  { truncated = false, totalCount = entries.length } = {},
) {
  const boundedEntries = entries.slice(0, MAX_REPOSITORY_TREE_ENTRIES);
  const implementationFiles = boundedEntries.filter(
    (entry) =>
      entry.type === "blob" && isMeaningfulImplementationPath(entry.path),
  );
  const inconclusiveFiles = boundedEntries.filter(
    (entry) =>
      entry.type === "blob" &&
      !isMeaningfulImplementationPath(entry.path) &&
      !isKnownNonImplementationPath(entry.path),
  );
  const implementationBytes = implementationFiles.reduce(
    (total, entry) => total + (Number(entry.size) || 0),
    0,
  );
  const onlyCommonScaffold =
    implementationFiles.length > 0 &&
    implementationFiles.every((entry) =>
      COMMON_SCAFFOLD_FILES.has(normalizedPath(entry.path)),
    );
  const bounded =
    truncated || totalCount > MAX_REPOSITORY_TREE_ENTRIES;
  const strongFootprint =
    !onlyCommonScaffold &&
    ((implementationFiles.length >= 2 && implementationBytes >= 1_024) ||
      implementationBytes >= 8_192);

  if (strongFootprint) {
    return {
      state: "implemented",
      reason: `${implementationFiles.length} implementation files establish a software footprint`,
      evidence: {
        implementationFileCount: implementationFiles.length,
        implementationBytes,
        treeEntryCount: totalCount,
        bounded,
      },
    };
  }

  if (
    !bounded &&
    implementationFiles.length === 0 &&
    inconclusiveFiles.length === 0
  ) {
    return {
      state: "not_started",
      reason: "repository contains no meaningful implementation files",
      evidence: {
        implementationFileCount: 0,
        implementationBytes: 0,
        treeEntryCount: totalCount,
        inconclusiveFileCount: 0,
        bounded: false,
      },
    };
  }

  return {
    state: "unknown",
    reason: onlyCommonScaffold
      ? "repository contains only a common framework scaffold"
      : "repository implementation footprint is incomplete or inconclusive",
    evidence: {
      implementationFileCount: implementationFiles.length,
      implementationBytes,
      treeEntryCount: totalCount,
      inconclusiveFileCount: inconclusiveFiles.length,
      bounded,
    },
  };
}

function validTimestamp(value) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function recentCommitsWithinWindow(
  commits,
  { now = new Date(), days = IMPLEMENTATION_ACTIVITY_DAYS } = {},
) {
  const cutoff = now.getTime() - days * 86_400_000;

  return commits
    .filter((commit) => {
      const committedAt = validTimestamp(commit.committedAt);
      return committedAt !== null && committedAt >= cutoff;
    })
    .slice(0, MAX_IMPLEMENTATION_COMMITS);
}

export function classifyImplementationChanges(
  files,
  { historyBounded = false, filesBounded = false } = {},
) {
  const implementationFiles = files.filter((file) =>
    isMeaningfulImplementationPath(file.filename ?? file.path),
  );
  const inconclusiveFiles = files.filter((file) => {
    const path = file.filename ?? file.path;
    return (
      !isMeaningfulImplementationPath(path) &&
      !isKnownNonImplementationPath(path)
    );
  });

  if (implementationFiles.length > 0) {
    return {
      state: "active",
      reason: `${implementationFiles.length} implementation ${implementationFiles.length === 1 ? "file has" : "files have"} changed recently`,
      evidence: {
        implementationFileCount: implementationFiles.length,
        changedFileCount: files.length,
        historyBounded,
        filesBounded,
      },
    };
  }

  if (historyBounded || filesBounded || inconclusiveFiles.length > 0) {
    return {
      state: "unknown",
      reason:
        inconclusiveFiles.length > 0
          ? "recent changed-file evidence contains unclassified file types"
          : "the bounded recent-change window is inconclusive",
      evidence: {
        implementationFileCount: 0,
        inconclusiveFileCount: inconclusiveFiles.length,
        changedFileCount: files.length,
        historyBounded,
        filesBounded,
      },
    };
  }

  return {
    state: "inactive",
    reason: "no meaningful implementation files changed recently",
    evidence: {
      implementationFileCount: 0,
      inconclusiveFileCount: 0,
      changedFileCount: files.length,
      historyBounded: false,
      filesBounded: false,
    },
  };
}

export async function fetchRepositoryImplementationMaturity(
  repository,
  headSha,
  { token, fetchImpl = fetch } = {},
) {
  if (!headSha) {
    return {
      state: "not_started",
      reason: "repository has no commits",
      evidence: { implementationFileCount: 0, treeEntryCount: 0 },
    };
  }

  const repositoryPath = encodeGitHubRepositoryPath(
    repository.owner,
    repository.name,
  );
  const { data } = await fetchGitHubJson(
    `/repos/${repositoryPath}/git/trees/${encodeURIComponent(headSha)}?recursive=1`,
    {
      token,
      fetchImpl,
      capability: "repository implementation structure",
    },
  );
  const tree = Array.isArray(data.tree) ? data.tree : [];

  return classifyRepositoryTree(tree, {
    truncated: Boolean(data.truncated),
    totalCount: tree.length,
  });
}

export async function fetchRecentImplementationActivity(
  repository,
  commits,
  { token, fetchImpl = fetch, now = new Date() } = {},
) {
  const recentCommits = recentCommitsWithinWindow(commits, { now });

  if (recentCommits.length === 0) {
    return {
      state: "inactive",
      reason: `no commits in the last ${IMPLEMENTATION_ACTIVITY_DAYS} days`,
      evidence: { inspectedCommitCount: 0, changedFileCount: 0 },
    };
  }

  const repositoryPath = encodeGitHubRepositoryPath(
    repository.owner,
    repository.name,
  );
  const newest = recentCommits[0];
  const oldest = recentCommits.at(-1);
  const baseSha = oldest.parentShas?.[0] ?? null;
  const path =
    recentCommits.length > 1 && baseSha
      ? `/repos/${repositoryPath}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(newest.sha)}`
      : `/repos/${repositoryPath}/commits/${encodeURIComponent(newest.sha)}`;
  const { data } = await fetchGitHubJson(path, {
    token,
    fetchImpl,
    capability: "recent implementation file changes",
  });
  const files = Array.isArray(data.files) ? data.files : null;

  if (!files) {
    return {
      state: "unknown",
      reason: "GitHub omitted recent changed-file evidence",
      evidence: { inspectedCommitCount: recentCommits.length },
    };
  }

  const oldestTime = validTimestamp(oldest.committedAt);
  const cutoff = now.getTime() - IMPLEMENTATION_ACTIVITY_DAYS * 86_400_000;
  const historyBounded =
    commits.length >= MAX_IMPLEMENTATION_COMMITS &&
    oldestTime !== null &&
    oldestTime >= cutoff;

  const classification = classifyImplementationChanges(files, {
    historyBounded,
    filesBounded: files.length >= 300,
  });

  return {
    ...classification,
    evidence: {
      ...classification.evidence,
      inspectedCommitCount: recentCommits.length,
    },
  };
}

function providerEvidence(error, subject) {
  return {
    state: "unknown",
    reason: `${subject} is unavailable`,
    error: {
      code: error?.code ?? "provider_failed",
    },
  };
}

export async function observeRepositoryImplementation(
  repository,
  { release, activity, token, fetchImpl = fetch, now = new Date() },
) {
  const commits = activity.status === "success" ? activity.items : [];
  const headSha = commits[0]?.sha ?? null;
  const shouldInspectTree = release.status === "success" && !release.item;
  const [treeResult, activityResult] = await Promise.allSettled([
    shouldInspectTree && activity.status === "success"
      ? fetchRepositoryImplementationMaturity(repository, headSha, {
          token,
          fetchImpl,
        })
      : Promise.resolve(null),
    activity.status === "success"
      ? fetchRecentImplementationActivity(repository, commits, {
          token,
          fetchImpl,
          now,
        })
      : Promise.reject(activity.error),
  ]);

  let maturity;

  if (release.status !== "success") {
    maturity = providerEvidence(release.error, "Published Release evidence");
  } else if (release.item) {
    maturity = {
      state: "released",
      reason: `published release ${release.item.tagName} exists`,
      evidence: {
        tagName: release.item.tagName,
        publishedAt: release.item.publishedAt,
      },
    };
  } else {
    maturity =
      treeResult.status === "fulfilled" && treeResult.value
        ? treeResult.value
        : providerEvidence(
            treeResult.reason ?? activity.error,
            "Repository implementation structure",
          );
  }

  return {
    status: "success",
    maturity,
    activity:
      activityResult.status === "fulfilled"
        ? activityResult.value
        : providerEvidence(
            activityResult.reason,
            "Recent implementation activity",
          ),
  };
}
