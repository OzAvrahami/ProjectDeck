import Link from "next/link";

import { PROJECT_SECTIONS } from "../lib/projects/navigation";
import { ThemeToggle } from "./theme-toggle.js";

export function AppShell({ children, activeSection = null, workspaceName = null }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-line bg-header">
        <div className="flex min-h-15 flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <Link
              className="text-[15px] font-bold tracking-[-0.01em]"
              href="/"
              aria-label="ProjectDeck overview"
            >
              ProjectDeck
            </Link>
            {workspaceName ? (
              <div className="flex items-center gap-2.5 text-sm">
                <Link className="text-muted hover:text-foreground" href="/">
                  ← All projects
                </Link>
                <span className="text-muted/50">/</span>
                <span className="font-semibold">{workspaceName}</span>
              </div>
            ) : (
              <nav aria-label="Portfolio navigation">
                <ul className="flex flex-wrap gap-1 text-sm">
                  {PROJECT_SECTIONS.map((section, index) => (
                    <li key={section}>
                      {index === 0 ? (
                        <Link
                          className={`header-nav-item ${
                            activeSection === section
                              ? "header-nav-item-active"
                              : ""
                          }`}
                          href="/"
                          aria-current={
                            activeSection === section ? "page" : undefined
                          }
                        >
                          {section}
                        </Link>
                      ) : (
                        <span
                          className="header-nav-item header-nav-item-disabled"
                          aria-disabled="true"
                          title="Coming in a later ProjectDeck slice"
                        >
                          {section}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-avatar text-[13px] font-semibold text-subtle"
              aria-label="Current user"
            >
              O
            </div>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
