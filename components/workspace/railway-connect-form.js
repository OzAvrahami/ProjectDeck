"use client";

import { useActionState } from "react";

import { connectRailwayResourceAction } from "../../app/projects/[slug]/actions.js";

const INITIAL_STATE = { status: "idle", message: null };

export function RailwayConnectForm({ slug, components }) {
  const [state, action, pending] = useActionState(
    connectRailwayResourceAction,
    INITIAL_STATE,
  );

  return (
    <details className="mt-4 border-t border-line-soft pt-4">
      <summary className="cursor-pointer text-xs font-semibold text-subtle hover:text-foreground">
        Connect Railway service
      </summary>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="slug" value={slug} />
        <label className="block text-xs text-muted">
          Label
          <input className="workspace-input" name="label" placeholder="Production" required />
        </label>
        <label className="block text-xs text-muted">
          Railway project ID
          <input className="workspace-input font-mono" name="railwayProjectId" required />
        </label>
        <label className="block text-xs text-muted">
          Environment ID
          <input className="workspace-input font-mono" name="environmentId" required />
        </label>
        <label className="block text-xs text-muted">
          Service ID
          <input className="workspace-input font-mono" name="serviceId" required />
        </label>
        {components.length > 0 ? (
          <label className="block text-xs text-muted">
            Component (optional)
            <select className="workspace-input" name="componentId" defaultValue="">
              <option value="">Project level</option>
              {components.map((component) => (
                <option key={component.id} value={component.id}>{component.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="workspace-button" type="submit" disabled={pending}>
          {pending ? "Connecting…" : "Connect service"}
        </button>
        {state.message ? (
          <p
            className={`text-xs leading-5 ${state.status === "error" ? "text-attention" : "text-subtle"}`}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
