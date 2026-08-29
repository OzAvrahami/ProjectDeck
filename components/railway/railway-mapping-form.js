"use client";

import { useActionState, useState } from "react";

import {
  removeRailwayMappingAction,
  saveRailwayMappingAction,
} from "../../app/settings/integrations/railway/mappings/actions.js";

const INITIAL_STATE = { status: "idle", message: "" };

export function RailwayMappingForm({ resource, projects }) {
  const [saveState, saveAction, savePending] = useActionState(
    saveRailwayMappingAction,
    INITIAL_STATE,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeRailwayMappingAction,
    INITIAL_STATE,
  );
  const [projectId, setProjectId] = useState(
    resource.mappedProject?.id ?? "",
  );
  const selectedProject = projects.find(({ id }) => id === projectId);
  const defaultComponentId =
    resource.mappedProject?.id === projectId
      ? resource.mappedComponent?.id ?? ""
      : "";

  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      <form action={saveAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="externalId" value={resource.externalId} />
        <label className="block text-xs font-medium text-subtle">
          ProjectDeck Project
          <select
            className="workspace-input mt-1.5"
            name="projectId"
            required
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="" disabled>Select a Project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-subtle">
          Component <span className="font-normal text-muted">optional</span>
          <select
            className="workspace-input mt-1.5"
            name="componentId"
            key={`${projectId}:${defaultComponentId}`}
            defaultValue={defaultComponentId}
            disabled={!selectedProject}
          >
            <option value="">Project-level</option>
            {(selectedProject?.components ?? []).map((component) => (
              <option key={component.id} value={component.id}>{component.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-subtle sm:col-span-2">
          Affects Project Health
          <select
            className="workspace-input mt-1.5"
            name="affectsProjectHealth"
            defaultValue={String(
              resource.association
                ? resource.association.affectsProjectHealth
                : resource.defaultAffectsProjectHealth,
            )}
          >
            <option value="true">Yes — operational signal</option>
            <option value="false">No — informational only</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            className="rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={savePending}
          >
            {savePending ? "Saving…" : resource.association ? "Save changes" : "Save mapping"}
          </button>
          {saveState.message ? (
            <p
              className={`text-xs ${saveState.status === "error" ? "text-attention" : "text-subtle"}`}
              role="status"
            >
              {saveState.message}
            </p>
          ) : null}
        </div>
      </form>

      {resource.association ? (
        <form action={removeAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="associationId" value={resource.association.id} />
          <button
            className="text-xs font-semibold text-muted hover:text-attention disabled:opacity-60"
            type="submit"
            disabled={removePending}
          >
            {removePending ? "Removing…" : "Remove mapping"}
          </button>
          {removeState.message ? (
            <p
              className={`text-xs ${removeState.status === "error" ? "text-attention" : "text-subtle"}`}
              role="status"
            >
              {removeState.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
