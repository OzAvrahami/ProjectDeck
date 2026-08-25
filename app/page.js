import { AppShell } from "../components/app-shell";

export default function HomePage() {
  return (
    <AppShell>
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center px-6 py-20 sm:px-10">
        <div className="max-w-2xl">
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-muted">
            Foundation / v0.1
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
            ProjectDeck
          </h1>
          <p className="mt-5 text-lg leading-8 text-subtle sm:text-xl">
            Application foundation ready.
          </p>
          <p className="mt-3 max-w-xl leading-7 text-muted">
            The full-stack shell, styling, database connection boundary, and
            test runners are prepared. Portfolio features remain intentionally
            unimplemented.
          </p>
          <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2 font-mono text-xs text-subtle shadow-sm">
            <span className="h-2 w-2 rounded-full bg-ready" aria-hidden="true" />
            Next.js foundation is running
          </div>
        </div>
      </section>
    </AppShell>
  );
}
