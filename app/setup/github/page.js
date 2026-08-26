import { AppShell } from "../../../components/app-shell.js";
import { GitHubImport } from "../../../components/github/github-import.js";
import {
  discoverGitHubRepositories,
  GitHubDiscoveryError,
} from "../../../lib/github/index.js";
import { markImportedRepositories } from "../../../lib/github/repositories.js";
import {
  listProjects,
  listProviderResourceConnections,
} from "../../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

async function loadGitHubDiscovery() {
  try {
    return {
      repositories: await discoverGitHubRepositories(),
      error: null,
    };
  } catch (error) {
    if (error instanceof GitHubDiscoveryError) {
      return {
        repositories: [],
        error: { code: error.code, message: error.message },
      };
    }

    return {
      repositories: [],
      error: {
        code: "provider",
        message: "GitHub repository discovery is temporarily unavailable.",
      },
    };
  }
}

async function loadProjectDeckConnections() {
  try {
    const [projectRows, connections] = await Promise.all([
      listProjects(),
      listProviderResourceConnections("github"),
    ]);

    return {
      projects: projectRows.map(({ id, name }) => ({ id, name })),
      connections,
      error: null,
    };
  } catch {
    return {
      projects: [],
      connections: [],
      error:
        "ProjectDeck's database is unavailable. Repository discovery can still be viewed, but importing is paused.",
    };
  }
}

export default async function GitHubSetupPage() {
  const [discovery, projectDeck] = await Promise.all([
    loadGitHubDiscovery(),
    loadProjectDeckConnections(),
  ]);
  const repositories = markImportedRepositories(
    discovery.repositories,
    projectDeck.connections,
  );

  return (
    <AppShell activeSection={null}>
      <GitHubImport
        repositories={repositories}
        existingProjects={projectDeck.projects}
        discoveryError={discovery.error}
        databaseError={projectDeck.error}
      />
    </AppShell>
  );
}
