import "server-only";

import {
  NEUTRAL_GITHUB_LABEL_COLOR,
  NEUTRAL_PROJECT_OPTION_COLOR,
  STANDARD_PROJECT_FIELDS,
} from "./definition.js";
import { isApprovedSafeStandardStep } from "./plan.js";
import {
  GITHUB_STANDARD_PROJECTS_WRITE_ENVIRONMENT_VARIABLE,
  GITHUB_STANDARD_REPOSITORY_WRITE_ENVIRONMENT_VARIABLE,
  requireGitHubStandardProjectsWriteToken,
  requireGitHubStandardRepositoryWriteToken,
} from "./credentials.js";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const GITHUB_API_VERSION = "2026-03-10";

const CREATE_PROJECT_FIELD_MUTATION = `
  mutation ProjectDeckCreateStandardField($input: CreateProjectV2FieldInput!) {
    createProjectV2Field(input: $input) {
      projectV2Field {
        ... on ProjectV2SingleSelectField { id name options { id name } }
      }
    }
  }
`;

export class GitHubStandardWriteError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GitHubStandardWriteError";
    this.code = code;
    this.status = details.status ?? null;
  }
}

function requireWriteToken(token, environmentVariable) {
  const value = String(token ?? "").trim();

  if (!value) {
    throw new GitHubStandardWriteError(
      "write_token_missing",
      `${environmentVariable} is not configured. This capability remains unavailable while audit and planning continue read-only.`,
    );
  }

  return value;
}

function writeHeaders(token, json = false) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
    "User-Agent": "ProjectDeck-Standard-Apply",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

async function createRepositoryLabel(step, { token, fetchImpl }) {
  const { owner, name } = step.target.repository;
  const url = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/labels`,
    GITHUB_API_URL,
  );
  let response;

  try {
    response = await fetchImpl(url, {
      method: "POST",
      cache: "no-store",
      headers: writeHeaders(token, true),
      body: JSON.stringify({
        name: step.target.label,
        color: NEUTRAL_GITHUB_LABEL_COLOR,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GitHubStandardWriteError(
      "provider_failed",
      `GitHub was unavailable while creating ${step.target.label} in ${owner}/${name}.`,
    );
  }

  if (!response.ok) {
    throw new GitHubStandardWriteError(
      response.status === 401 || response.status === 403
        ? "permission_denied"
        : "provider_failed",
      `GitHub did not create ${step.target.label} in ${owner}/${name}.`,
      { status: response.status },
    );
  }

  return {
    stepId: step.id,
    action: step.action,
    target: `${owner}/${name} · ${step.target.label}`,
  };
}

async function createProjectField(step, { token, fetchImpl }) {
  const fieldName = step.target.fieldName;
  const options = STANDARD_PROJECT_FIELDS[fieldName].map((name) => ({
    name,
    color: NEUTRAL_PROJECT_OPTION_COLOR,
    description: "",
  }));
  let response;

  try {
    response = await fetchImpl(GITHUB_GRAPHQL_URL, {
      method: "POST",
      cache: "no-store",
      headers: writeHeaders(token, true),
      body: JSON.stringify({
        query: CREATE_PROJECT_FIELD_MUTATION,
        variables: {
          input: {
            projectId: step.target.project.id,
            dataType: "SINGLE_SELECT",
            name: fieldName,
            singleSelectOptions: options,
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GitHubStandardWriteError(
      "provider_failed",
      `GitHub was unavailable while creating the ${fieldName} Project field.`,
    );
  }

  if (!response.ok) {
    throw new GitHubStandardWriteError(
      response.status === 401 || response.status === 403
        ? "permission_denied"
        : "provider_failed",
      `GitHub did not create the ${fieldName} Project field.`,
      { status: response.status },
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new GitHubStandardWriteError(
      "provider_failed",
      `GitHub returned an unexpected response while creating the ${fieldName} Project field.`,
    );
  }

  if (
    payload.errors?.length ||
    !payload.data?.createProjectV2Field?.projectV2Field
  ) {
    throw new GitHubStandardWriteError(
      "provider_failed",
      `GitHub did not verify creation of the ${fieldName} Project field.`,
    );
  }

  return {
    stepId: step.id,
    action: step.action,
    target: `${step.target.project.title} · ${fieldName}`,
  };
}

function assertApprovedStep(step, expectedAction, capability) {
  if (!isApprovedSafeStandardStep(step)) {
    throw new GitHubStandardWriteError(
      "unsafe_step",
      "ProjectDeck rejected a Standard migration step outside the safe allowlist.",
    );
  }

  if (step.action !== expectedAction) {
    throw new GitHubStandardWriteError(
      "wrong_write_capability",
      `The ${capability} write capability cannot execute ${step.action}.`,
    );
  }
}

export function createGitHubStandardRepositoryWriteClient({
  repositoryToken = requireGitHubStandardRepositoryWriteToken(),
  fetchImpl = fetch,
} = {}) {
  const writeToken = requireWriteToken(
    repositoryToken,
    GITHUB_STANDARD_REPOSITORY_WRITE_ENVIRONMENT_VARIABLE,
  );

  return {
    capability: "repository",
    async executeSafeStep(step) {
      assertApprovedStep(step, "create_repository_label", "repository");
      return createRepositoryLabel(step, { token: writeToken, fetchImpl });
    },
  };
}

export function createGitHubStandardProjectsWriteClient({
  projectsToken = requireGitHubStandardProjectsWriteToken(),
  fetchImpl = fetch,
} = {}) {
  const writeToken = requireWriteToken(
    projectsToken,
    GITHUB_STANDARD_PROJECTS_WRITE_ENVIRONMENT_VARIABLE,
  );

  return {
    capability: "projects",
    async executeSafeStep(step) {
      assertApprovedStep(
        step,
        "create_project_single_select_field",
        "Projects",
      );
      return createProjectField(step, { token: writeToken, fetchImpl });
    },
  };
}
