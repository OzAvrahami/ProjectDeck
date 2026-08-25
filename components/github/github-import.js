"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { importGitHubRepositoriesAction } from "../../app/setup/github/actions.js";
import {
  filterRepositories,
  suggestComponentName,
  suggestGroupProjectName,
  suggestProjectName,
} from "../../lib/github/repositories.js";

const INITIAL_ACTION_STATE = { status: "idle", message: "" };

function formatRepositoryDate(value) {
  if (!value) {
    return "No recent push recorded";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function newGroupForRepository(repository) {
  return {
    id: `group-${repository.id}`,
    targetProjectId: "",
    projectName: suggestProjectName(repository.name),
    nextAction: "",
    repositories: [{ externalId: repository.id, componentName: "" }],
  };
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
  const [selectedIds, setSelectedIds] = useState([]);
  const [step, setStep] = useState("discover");
  const [groups, setGroups] = useState([]);
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
    setSelectedIds((current) =>
      current.includes(repositoryId)
        ? current.filter((id) => id !== repositoryId)
        : [...current, repositoryId],
    );
  }

  function beginGrouping() {
    const selectedRepositories = repositories.filter((repository) =>
      selectedIds.includes(repository.id),
    );

    setGroups(selectedRepositories.map(newGroupForRepository));
    setStep("group");
  }

  function updateGroup(groupId, update) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, ...update } : group,
      ),
    );
  }

  function updateRepositoryAssignment(groupId, externalId, componentName) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              repositories: group.repositories.map((repository) =>
                repository.externalId === externalId
                  ? { ...repository, componentName }
                  : repository,
              ),
            }
          : group,
      ),
    );
  }

  function moveRepository(sourceGroupId, externalId, targetGroupId) {
    setGroups((current) => {
      const sourceGroup = current.find((group) => group.id === sourceGroupId);
      const assignment = sourceGroup?.repositories.find(
        (repository) => repository.externalId === externalId,
      );

      if (!sourceGroup || !assignment || targetGroupId === sourceGroupId) {
        return current;
      }

      if (targetGroupId === "separate") {
        if (sourceGroup.repositories.length === 1) {
          return current;
        }

        const repository = repositoryById.get(externalId);
        const separateGroup = {
          ...newGroupForRepository(repository),
          id: `group-${externalId}-${Date.now()}`,
        };

        return [
          ...current.map((group) =>
            group.id === sourceGroupId
              ? {
                  ...group,
                  repositories: group.repositories.filter(
                    (item) => item.externalId !== externalId,
                  ),
                }
              : group,
          ),
          separateGroup,
        ];
      }

      const targetGroup = current.find((group) => group.id === targetGroupId);

      if (!targetGroup) {
        return current;
      }

      const groupedRepositories = [
        ...targetGroup.repositories.map((item) =>
          repositoryById.get(item.externalId),
        ),
        repositoryById.get(externalId),
      ];
      const movedAssignment = {
        ...assignment,
        componentName:
          assignment.componentName ||
          suggestComponentName(
            repositoryById.get(externalId),
            groupedRepositories,
          ),
      };

      return current
        .map((group) => {
          if (group.id === sourceGroupId) {
            return {
              ...group,
              repositories: group.repositories.filter(
                (repository) => repository.externalId !== externalId,
              ),
            };
          }

          if (group.id === targetGroupId) {
            return {
              ...group,
              repositories: [...group.repositories, movedAssignment],
            };
          }

          return group;
        })
        .filter((group) => group.repositories.length > 0);
    });
  }

  function combineAllRepositories() {
    const groupedRepositories = groups.flatMap((group) =>
      group.repositories.map((assignment) =>
        repositoryById.get(assignment.externalId),
      ),
    );
    const firstGroup = groups[0];

    setGroups([
      {
        ...firstGroup,
        targetProjectId: "",
        projectName: suggestGroupProjectName(groupedRepositories),
        nextAction: "",
        repositories: groupedRepositories.map((repository) => ({
          externalId: repository.id,
          componentName: suggestComponentName(
            repository,
            groupedRepositories,
          ),
        })),
      },
    ]);
  }

  const importPayload = JSON.stringify({
    groups: groups.map((group) => ({
      targetProjectId: group.targetProjectId || null,
      projectName: group.projectName,
      nextAction: group.nextAction,
      repositories: group.repositories,
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
        <button
          className="mt-8 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition hover:border-accent"
          type="button"
          onClick={() => window.location.reload()}
        >
          Scan GitHub again
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-16">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-line pb-8">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            Setup / GitHub
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">
            Connect repositories to Projects
          </h1>
          <p className="mt-3 leading-7 text-subtle">
            GitHub supplies the technical facts. You decide which repositories
            belong to the same product and whether Components make that
            relationship clearer.
          </p>
        </div>
        <button
          className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition hover:border-accent disabled:cursor-wait disabled:opacity-60"
          type="button"
          onClick={refreshDiscovery}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Scanning…" : "Scan again"}
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

      {!discoveryError && repositories.length > 0 && step === "discover" ? (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-xs text-muted">
              {repositories.length} discovered · {connectedCount} connected
            </p>
            <p className="text-sm text-subtle">
              {selectedIds.length} selected
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
              const selected = selectedIds.includes(repository.id);

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
                      {repository.language ?? "Language unknown"} · Last pushed{" "}
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

          <div className="mt-7 flex justify-end">
            <button
              className="rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={selectedIds.length === 0 || Boolean(databaseError)}
              onClick={beginGrouping}
            >
              Group {selectedIds.length || "selected"} repositories →
            </button>
          </div>
        </>
      ) : null}

      {step === "group" ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">
                Confirm Project structure
              </p>
              <p className="mt-2 text-sm text-subtle">
                Repositories remain separate unless you explicitly move them
                into the same Project.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold"
                type="button"
                onClick={() => setStep("discover")}
              >
                Back
              </button>
              {groups.length > 1 ? (
                <button
                  className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-accent"
                  type="button"
                  onClick={combineAllRepositories}
                >
                  Combine all into one Project
                </button>
              ) : null}
            </div>
          </div>

          <form action={formAction} className="mt-7 space-y-5">
            <input type="hidden" name="payload" value={importPayload} />
            {groups.map((group, groupIndex) => {
              const isExistingProject = Boolean(group.targetProjectId);

              return (
                <fieldset
                  className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
                  key={group.id}
                >
                  <legend className="px-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">
                    Project {groupIndex + 1}
                  </legend>

                  <label className="block text-sm font-medium">
                    Import destination
                    <select
                      className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm"
                      value={group.targetProjectId}
                      onChange={(event) =>
                        updateGroup(group.id, {
                          targetProjectId: event.target.value,
                        })
                      }
                    >
                      <option value="">Create a new Project</option>
                      {existingProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          Add to {project.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {!isExistingProject ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium">
                        Project display name
                        <input
                          className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm"
                          value={group.projectName}
                          maxLength={160}
                          required
                          onChange={(event) =>
                            updateGroup(group.id, {
                              projectName: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        Next action <span className="text-muted">optional</span>
                        <input
                          className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm"
                          value={group.nextAction}
                          placeholder="Leave empty if not decided"
                          onChange={(event) =>
                            updateGroup(group.id, {
                              nextAction: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted">
                      The existing Project&apos;s lifecycle, attention, description,
                      and Next action will not be changed.
                    </p>
                  )}

                  <div className="mt-6 divide-y divide-line border-y border-line">
                    {group.repositories.map((assignment) => {
                      const repository = repositoryById.get(
                        assignment.externalId,
                      );

                      return (
                        <div
                          className="grid gap-4 py-4 lg:grid-cols-[1fr_0.8fr_0.9fr] lg:items-end"
                          key={assignment.externalId}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {repository.fullName}
                            </p>
                            <p className="mt-1 font-mono text-xs text-muted">
                              GitHub repository
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
                                updateRepositoryAssignment(
                                  group.id,
                                  assignment.externalId,
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <label className="text-sm font-medium">
                            Project group
                            <select
                              className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                              value={group.id}
                              onChange={(event) =>
                                moveRepository(
                                  group.id,
                                  assignment.externalId,
                                  event.target.value,
                                )
                              }
                            >
                              {groups.map((candidate, index) => (
                                <option key={candidate.id} value={candidate.id}>
                                  Project {index + 1}
                                  {candidate.projectName
                                    ? ` · ${candidate.projectName}`
                                    : ""}
                                </option>
                              ))}
                              {group.repositories.length > 1 ? (
                                <option value="separate">
                                  Move to a new separate Project
                                </option>
                              ) : null}
                            </select>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
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
                disabled={isImporting}
              >
                {isImporting ? "Saving import…" : "Confirm import"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
