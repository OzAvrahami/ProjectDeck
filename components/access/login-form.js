"use client";

import { useActionState } from "react";

import { loginAction } from "../../app/login/actions.js";

const INITIAL_STATE = { status: "idle", message: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL_STATE);

  return (
    <form action={action} className="mt-7 space-y-4">
      <label className="block text-sm font-medium" htmlFor="password">
        Password
      </label>
      <input
        className="w-full rounded-lg border border-line bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent"
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
      />
      <button
        className="inline-flex w-full items-center justify-center rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-65"
        type="submit"
        disabled={pending}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state.message ? (
        <p className="text-sm leading-6 text-attention" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
