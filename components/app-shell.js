import Link from "next/link";

import { PROJECT_SECTIONS } from "../lib/projects/navigation";

export function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3 sm:px-10">
          <Link
            className="font-semibold tracking-[-0.02em]"
            href="/"
            aria-label="ProjectDeck overview"
          >
            ProjectDeck
          </Link>
          <nav aria-label="Portfolio navigation">
            <ul className="flex flex-wrap gap-5 text-sm text-muted">
              {PROJECT_SECTIONS.map((section, index) => (
                <li key={section}>
                  {index === 0 ? (
                    <Link className="font-medium text-foreground" href="/">
                      {section}
                    </Link>
                  ) : (
                    <span aria-disabled="true">{section}</span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
