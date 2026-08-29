"use client";

import { useActionState, useState } from "react";

import { createHealthMonitorAction } from "../../app/projects/[slug]/actions.js";

const INITIAL_STATE = { status: "idle", message: null, errors: {} };

export function HealthMonitorForm({ slug, components }) {
  const [type, setType] = useState("none");
  const [state, action, pending] = useActionState(
    createHealthMonitorAction,
    INITIAL_STATE,
  );

  return (
    <details className="mt-5 border-t border-line-soft pt-4">
      <summary className="cursor-pointer text-xs font-semibold text-subtle hover:text-foreground">
        Configure monitoring
      </summary>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="slug" value={slug} />
        <label className="block text-xs text-muted">
          Monitor
          <select
            className="workspace-input"
            name="monitorType"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="none">None</option>
            <option value="vercel_deployment">Vercel deployment</option>
            <option value="http">HTTP endpoint</option>
            <option value="postgres">PostgreSQL</option>
          </select>
        </label>

        {type !== "none" ? (
          <>
            <label className="block text-xs text-muted">
              Label
              <input className="workspace-input" name="label" placeholder="Production API" required />
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
            <label className="block text-xs text-muted">
              Affects Project Health
              <select className="workspace-input" name="affectsProjectHealth" defaultValue="true">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </>
        ) : null}

        {type === "vercel_deployment" ? (
          <>
            <label className="block text-xs text-muted">Vercel Project ID<input className="workspace-input font-mono" name="vercelProjectId" required /></label>
            <label className="block text-xs text-muted">Team ID (optional)<input className="workspace-input font-mono" name="vercelTeamId" /></label>
          </>
        ) : null}

        {type === "http" ? (
          <>
            <label className="block text-xs text-muted">Explicit health URL<input className="workspace-input font-mono" name="httpUrl" type="url" placeholder="https://example.com/health" required /></label>
            <label className="block text-xs text-muted">Method<select className="workspace-input" name="httpMethod" defaultValue="GET"><option>GET</option><option>HEAD</option></select></label>
          </>
        ) : null}

        {type === "postgres" ? (
          <label className="block text-xs text-muted">
            Connection environment variable
            <input className="workspace-input font-mono" name="connectionEnvVar" placeholder="LIFEOS_HEALTH_DATABASE_URL" pattern="[A-Z][A-Z0-9_]*" required />
            <span className="mt-1 block text-[10px] leading-4">Only the variable name is stored. Its value remains server-side.</span>
          </label>
        ) : null}

        {type !== "none" ? (
          <button className="workspace-button" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add monitor"}
          </button>
        ) : null}
        {state.message ? (
          <p className={`text-xs leading-5 ${state.status === "error" ? "text-attention" : "text-subtle"}`} role={state.status === "error" ? "alert" : "status"}>
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
