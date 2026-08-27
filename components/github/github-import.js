"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { importGitHubRepositoriesAction } from "../../app/setup/github/actions.js";
import {
  applyCandidateGrouping,
  createGroupingDraft,
  createProjectCandidates,
  separateProjectCandidate,
} from "../../lib/github/import-candidates.js";
import { filterRepositories } from "../../lib/github/repositories.js";

const INITIAL_ACTION_STATE = { status: "idle", message: "" };

function formatRepositoryDate(value) {
  if (!value) {
    return "No recent push recorded";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function repositoryCountLabel(count) {
  return `${count} ${count === 1 ? "repository" : "repositories"}`;
}

function projectCountLabel(count) {
  return `${count} ${count === 1 ? "Project" : "Projects"}`;
}

export function GitHubImport({
  repositories,
  existingProjects,
  discoveryError,
  databaseError,
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showForks, setShowForks] = useState(false);
  const [selectedRepositoryIds, setSelectedRepositoryIds] = useState([]);
  const [step, setStep] = useState("select");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const [groupingDraft, setGroupingDraft] = useState(null);
  const [existingProjectPickerId, setExistingProjectPickerId] = useState(null);
  const [actionState, formAction, isImporting] = useActionState(
    importGitHubRepositoriesAction,
    INITIAL_ACTION_STATE,
  );

  const visibleRepositories = useMemo(
    () =>
      filterRepositories(repositories, {
        search,
        showArchived,
        showForks,
      }),
    [repositories, search, showArchived, showForks],
  );
  const repositoryById = useMemo(
    () => new Map(repositories.map((repository) => [repository.id, repository])),
    [repositories],
  );
  const existingProjectById = useMemo(
    () => new Map(existingProjects.map((project) => [project.id, project])),
    [existingProjects],
  );
  const archivedCount = repositories.filter(
    (repository) => repository.archived,
  ).length;
  const forkCount = repositories.filter((repository) => repository.fork).length;
  const connectedCount = repositories.filter(
    (repository) => repository.imported,
  ).length;

  function refreshDiscovery() {
    startRefresh(() => router.refresh());
  }

  function toggleRepository(repositoryId) {
    setSelectedRepositoryIds((current) =>
      current.includes(repositoryId)
        ? current.filter((id) => id !== repositoryId)
        : [...current, repositoryId],
    );
  }

  function beginReview() {
    const selectedRepositories = repositories.filter((repository) =>
      selectedRepositoryIds.includes(repository.id),
    );

    setCandidates(createProjectCandidates(selectedRepositories));
    setSelectedCandidateIds([]);
    setGroupingDraft(null);
    setExistingProjectPickerId(null);
    setStep("review");
  }

  function updateCandidate(candidateId, update) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, ...update } : candidate,
      ),
    );
  }

  function updateRepositoryAssignment(
    candidateId,
    externalId,
    componentName,
  ) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              repositories: candidate.repositories.map((repository) =>
                repository.externalId === externalId
                  ? { ...repository, componentName }
                  : repository,
              ),
            }
          : candidate,
      ),
    );
  }

  function toggleCandidate(candidateId) {
    setSelectedCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId],
    );
  }

  function beginExplicitGrouping() {
    setGroupingDraft(
      createGroupingDraft(
        candidates,
        selectedCandidateIds,
        repositories,
      ),
    );
  }

  function updateGroupingRepository(externalId, componentName) {
    setGroupingDraft((current) => ({
      ...current,
      repositories: current.repositories.map((repository) =>
        repository.externalId === externalId
          ? { ...repository, componentName }
          : repository,
      ),
    }));
  }

  function confirmGrouping() {
    setCandidates((current) =>
      applyCandidateGrouping(current, groupingDraft),
    );
    setSelectedCandidateIds([]);
    setGroupingDraft(null);
    setExistingProjectPickerId(null);
  }

  function separateCandidate(candidateId) {
    setCandidates((current) =>
      separateProjectCandidate(current, candidateId, repositories),
    );
    setSelectedCandidateIds((current) =>
      current.filter((id) => id !== candidateId),
    );
    setExistingProjectPickerId((current) =>
      current === candidateId ? null : current,
    );
  }

  function showExistingProjectPicker(candidateId) {
    setExistingProjectPickerId(candidateId);
    setSelectedCandidateIds((current) =>
      current.filter((id) => id !== candidateId),
    );
  }

  function switchToNewProject(candidateId) {
    updateCandidate(candidateId, { targetProjectId: "" });
    setExistingProjectPickerId(null);
  }

  const importPayload = JSON.stringify({
    candidates: candidates.map((candidate) => ({
      targetProjectId: candidate.targetProjectId || null,
      projectName: candidate.projectName,
      nextAction: candidate.nextAction,
      repositories: candidate.repositories,
    })),
  });

  if (actionState.status === "success") {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-ready">
          Import complete
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">
          Repositories connected
        </h1>
        <p className="mt-4 text-subtle">{actionState.message}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:opacity-85"
            href="/projects"
          >
            View Projects →
          </Link>
          <button
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition hover:border-accent"
            type="button"
            onClick={() => window.location.reload()}
          >
            Scan GitHub again
          </button>
          <Link
            className="rounded-lg px-3 py-2.5 text-sm font-semibold text-subtle hover:text-foreground"
            href="/settings"
          >
            Back to Settings
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-16">
      <nav className="mb-7 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted" aria-label="GitHub setup context">
        <Link className="hover:text-foreground" href="/settings">
          ← Settings
        </Link>
        <span aria-hidden="true">·</span>
        <Link className="hover:text-foreground" href="/projects">
          Projects
        </Link>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-line pb-8">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            Setup / GitHub
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">
            Import GitHub repositories
          </h1>
          <p className="mt-3 leading-7 text-subtle">
            Choose the repositories you want in ProjectDeck. Each repository
            starts as its own Project; grouping is an optional review step.
          </p>
        </div>
        <button
          className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition hover:border-accent disabled:cursor-wait disabled:opacity-60"
          type="button"
          onClick={refreshDiscovery}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Scanning..." : "Scan again"}
        </button>
      </div>

      {discoveryError ? (
        <div className="mt-8 rounded-xl border border-line bg-surface p-5">
          <p className="font-semibold">Repository scan unavailable</p>
          <p className="mt-2 text-sm leading-6 text-subtle">
            {discoveryError.message}
          </p>
        </div>
      ) : null}

      {databaseError ? (
        <div className="mt-5 rounded-xl border border-line bg-surface p-5">
          <p className="font-semibold">Import persistence unavailable</p>
          <p className="mt-2 text-sm leading-6 text-subtle">{databaseError}</p>
        </div>
      ) : null}

      {!discoveryError && repositories.length === 0 ? (
        <div className="mt-8 rounded-xl border border-line bg-surface p-8 text-center">
          <p className="font-semibold">No accessible repositories found</p>
          <p className="mt-2 text-sm text-muted">
            The GitHub scan succeeded, but this token cannot currently see any
            repositories.
          </p>
        </div>
      ) : null}

      {!discoveryError && repositories.length > 0 && step === "select" ? (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-xs text-muted">
              {repositories.length} discovered / {connectedCount} connected
            </p>
            <p className="text-sm text-subtle">
              {selectedRepositoryIds.length} selected
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <label className="min-w-64 flex-1">
              <span className="sr-only">Search repositories</span>
              <input
                className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search repositories"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-subtle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Archived ({archivedCount})
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-subtle">
              <input
                type="checkbox"
                checked={showForks}
                onChange={(event) => setShowForks(event.target.checked)}
              />
              Forks ({forkCount})
            </label>
          </div>

          <div className="mt-6 divide-y divide-line border-y border-line">
            {visibleRepositories.map((repository) => {
              const disabled = repository.imported || Boolean(databaseError);
              const selected = selectedRepositoryIds.includes(repository.id);

              return (
                <div
                  className={`flex gap-4 py-5 ${
                    repository.archived || repository.fork ? "opacity-70" : ""
                  }`}
                  key={repository.id}
                >
                  <input
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                    type="checkbox"
                    aria-label={`Select ${repository.fullName}`}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => toggleRepository(repository.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <a
                        className="font-semibold hover:text-accent"
                        href={repository.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {repository.fullName} ↗
                      </a>
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                        {repository.visibility}
                      </span>
                      {repository.archived ? (
                        <span className="font-mono text-[11px] text-muted">
                          Archived
                        </span>
                      ) : null}
                      {repository.fork ? (
                        <span className="font-mono text-[11px] text-muted">
                          Fork
                        </span>
                      ) : null}
                      {repository.imported ? (
                        <span className="font-mono text-[11px] text-ready">
                          Connected to {repository.importedProjectName}
                        </span>
                      ) : null}
                    </div>
                    {repository.description ? (
                      <p className="mt-2 text-sm leading-6 text-subtle">
                        {repository.description}
                      </p>
                    ) : null}
                    <p className="mt-2 font-mono text-xs text-muted">
                      {repository.language ?? "Language unknown"} / Last pushed{" "}
                      {formatRepositoryDate(repository.pushedAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {visibleRepositories.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              No repositories match these filters.
            </p>
          ) : null}

          <div className="mt-7 flex justify-end border-t border-line pt-5">
            <button
              className="inline-flex w-fit items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-[background-color,color,opacity] enabled:hover:opacity-85 disabled:cursor-not-allowed disabled:border-line disabled:bg-avatar disabled:text-subtle"
              type="button"
              disabled={
                selectedRepositoryIds.length === 0 || Boolean(databaseError)
              }
              onClick={beginReview}
            >
              {selectedRepositoryIds.length === 0
                ? "Select repositories to continue"
                : `Continue with ${repositoryCountLabel(selectedRepositoryIds.length)} →`}
            </button>
          </div>
        </>
      ) : null}

      {step === "review" ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">
                Review Project candidates
              </p>
              <p className="mt-2 text-sm text-subtle">
                Each selected repository is a separate Project by default.
                Select two or more candidates only when you want to group them.
              </p>
            </div>
            <button
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-accent"
              type="button"
              onClick={() => setStep("select")}
            >
              Back to repositories
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-sm text-subtle">
              {selectedCandidateIds.length === 0
                ? "Select Project candidates to group them."
                : `${selectedCandidateIds.length} selected for grouping`}
            </p>
            <button
              className="rounded-lg border border-line bg-background px-4 py-2 text-sm font-semibold hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={selectedCandidateIds.length < 2}
              onClick={beginExplicitGrouping}
            >
              Group into one Project
            </button>
          </div>

          {groupingDraft ? (
            <section
              className="mt-5 rounded-2xl border border-accent bg-surface p-5 sm:p-6"
              aria-labelledby="group-project-heading"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    className="text-lg font-semibold"
                    id="group-project-heading"
                  >
                    Group repositories into one Project
                  </h2>
                  <p className="mt-1 text-sm text-subtle">
                    Confirm the shared Project name and optional Components.
                  </p>
                </div>
                <button
                  className="text-sm font-semibold text-subtle hover:text-foreground"
                  type="button"
                  onClick={() => setGroupingDraft(null)}
                >
                  Cancel
                </button>
              </div>

              <label className="mt-5 block max-w-xl text-sm font-medium">
                Project name
                <input
                  className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm"
                  value={groupingDraft.projectName}
                  maxLength={160}
                  onChange={(event) =>
                    setGroupingDraft((current) => ({
                      ...current,
                      projectName: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="mt-5 divide-y divide-line border-y border-line">
                {groupingDraft.repositories.map((assignment) => {
                  const repository = repositoryById.get(assignment.externalId);

                  return (
                    <div
                      className="grid gap-3 py-4 sm:grid-cols-[1fr_0.8fr] sm:items-end"
                      key={assignment.externalId}
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                          Repository
                        </p>
                        <p className="mt-1 truncate font-semibold">
                          {repository.fullName}
                        </p>
                      </div>
                      <label className="text-sm font-medium">
                        Component <span className="text-muted">optional</span>
                        <input
                          className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                          value={assignment.componentName}
                          maxLength={160}
                          placeholder="e.g. Desktop"
                          onChange={(event) =>
                            updateGroupingRepository(
                              assignment.externalId,
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  disabled={!groupingDraft.projectName.trim()}
                  onClick={confirmGrouping}
                >
                  Create {groupingDraft.projectName.trim() || "Project"}
                </button>
              </div>
            </section>
          ) : null}

          <form action={formAction} className="mt-7 space-y-5">
            <input type="hidden" name="payload" value={importPayload} />
            {candidates.map((candidate) => {
              const existingProject = existingProjectById.get(
                candidate.targetProjectId,
              );
              const isExistingProject = Boolean(existingProject);
              const candidateTitle =
                existingProject?.name || candidate.projectName || "New Project";
              const showsExistingProjectPicker =
                existingProjectPickerId === candidate.id;

              return (
                <article
                  className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
                  key={candidate.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <label className="flex min-w-0 items-start gap-3">
                      <input
                        className="mt-1 h-4 w-4 accent-[var(--accent)]"
                        type="checkbox"
                        aria-label={`Select ${candidateTitle} for grouping`}
                        checked={selectedCandidateIds.includes(candidate.id)}
                        disabled={isExistingProject}
                        onChange={() => toggleCandidate(candidate.id)}
                      />
                      <span className="min-w-0">
                        <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                          {isExistingProject
                            ? "Add to existing Project"
                            : candidate.repositories.length > 1
                              ? `${candidate.repositories.length} repositories`
                              : "Project candidate"}
                        </span>
                        <span className="mt-1 block truncate text-lg font-semibold">
                          {candidateTitle}
                        </span>
                      </span>
                    </label>

                    <div className="flex flex-wrap gap-3">
                      {candidate.repositories.length > 1 &&
                      !isExistingProject ? (
                        <button
                          className="text-sm font-semibold text-subtle hover:text-foreground"
                          type="button"
                          onClick={() => separateCandidate(candidate.id)}
                        >
                          Separate repositories
                        </button>
                      ) : null}
                      {existingProjects.length > 0 &&
                      !showsExistingProjectPicker &&
                      !isExistingProject ? (
                        <button
                          className="text-sm font-semibold text-subtle hover:text-foreground"
                          type="button"
                          onClick={() =>
                            showExistingProjectPicker(candidate.id)
                          }
                        >
                          Add to existing Project
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {showsExistingProjectPicker || isExistingProject ? (
                    <div className="mt-5 rounded-xl border border-line bg-background p-4">
                      <label className="block text-sm font-medium">
                        Existing Project
                        <select
                          className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm"
                          value={candidate.targetProjectId}
                          onChange={(event) =>
                            updateCandidate(candidate.id, {
                              targetProjectId: event.target.value,
                            })
                          }
                        >
                          <option value="">Choose a Project</option>
                          {existingProjects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-muted">
                          Existing lifecycle, attention, description, and Next
                          action will not be changed.
                        </p>
                        <button
                          className="text-sm font-semibold text-subtle hover:text-foreground"
                          type="button"
                          onClick={() => switchToNewProject(candidate.id)}
                        >
                          Create a new Project instead
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium">
                        Project name
                        <input
                          className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm"
                          value={candidate.projectName}
                          maxLength={160}
                          required
                          onChange={(event) =>
                            updateCandidate(candidate.id, {
                              projectName: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        Next action <span className="text-muted">optional</span>
                        <input
                          className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm"
                          value={candidate.nextAction}
                          placeholder="Leave empty if not decided"
                          onChange={(event) =>
                            updateCandidate(candidate.id, {
                              nextAction: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  )}

                  <div className="mt-6 divide-y divide-line border-y border-line">
                    {candidate.repositories.map((assignment) => {
                      const repository = repositoryById.get(
                        assignment.externalId,
                      );
                      const showComponent =
                        candidate.repositories.length > 1 || isExistingProject;

                      return (
                        <div
                          className={`grid gap-3 py-4 ${
                            showComponent
                              ? "sm:grid-cols-[1fr_0.8fr] sm:items-end"
                              : ""
                          }`}
                          key={assignment.externalId}
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                              Repository
                            </p>
                            <p className="mt-1 truncate font-semibold">
                              {repository.fullName}
                            </p>
                          </div>
                          {showComponent ? (
                            <label className="text-sm font-medium">
                              Component{" "}
                              <span className="text-muted">optional</span>
                              <input
                                className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                                value={assignment.componentName}
                                maxLength={160}
                                placeholder="e.g. Desktop"
                                onChange={(event) =>
                                  updateRepositoryAssignment(
                                    candidate.id,
                                    assignment.externalId,
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}

            {actionState.status === "error" ? (
              <div className="rounded-xl border border-line bg-surface p-4 text-sm text-subtle">
                <span className="font-semibold text-foreground">
                  Import not saved.{" "}
                </span>
                {actionState.message}
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                className="rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:cursor-wait disabled:opacity-50"
                type="submit"
                disabled={isImporting || Boolean(groupingDraft)}
              >
                {isImporting
                  ? "Saving import..."
                  : `Import ${projectCountLabel(candidates.length)}`}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
