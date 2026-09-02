const ATTENTION_SEVERITY_RANK = {
  critical: 0,
  high: 1,
  normal: 2,
};

const ACTIVE_BUG_STATUSES = new Set(["Ready", "In Progress", "Verify"]);
const ATTENTION_BUG_PRIORITIES = new Map([
  ["P0 — Critical", "critical"],
  ["P1 — High", "high"],
]);
const INTERVENTION_ERROR_CODES = new Set([
  "authentication_failed",
  "permission_denied",
  "configuration_missing",
  "token_missing",
  "invalid_association",
  "authorization_reconnect_required",
]);

function cleanOptionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizedRepository(value) {
  return String(value ?? "").trim().toLowerCase();
}

function observationAffectsHealth(observation) {
  return observation?.monitor?.enabled && observation.monitor.affectsProjectHealth;
}

function affectedContext(observation) {
  return {
    provider: observation.provider ?? null,
    resource: observation.resource
      ? {
          id: observation.resource.id ?? null,
          label: observation.resource.label ?? null,
          url: observation.resource.url ?? null,
          externalId: observation.resource.externalId ?? null,
        }
      : null,
    component: observation.component
      ? {
          id: observation.component.id ?? null,
          name: observation.component.name ?? null,
        }
      : null,
    observed_at: observation.observedAt ?? null,
  };
}

function affectedLabel(observation) {
  return observation.component?.name ??
    observation.resource?.label ??
    observation.monitor?.label ??
    "Required production resource";
}

function providerLabel(provider) {
  return {
    railway: "Railway",
    vercel: "Vercel",
    postgresql: "PostgreSQL",
    http: "HTTP",
  }[provider] ?? "Provider";
}

function signal({ code, severity, reason, observation = null, details = {} }) {
  return {
    code,
    severity,
    reason,
    ...(observation ? affectedContext(observation) : {
      provider: details.provider ?? null,
      resource: details.resource ?? null,
      component: details.component ?? null,
      observed_at: details.observed_at ?? null,
    }),
    evidence: details.evidence ?? null,
  };
}

function downSignals(health) {
  const observations = (health?.observations ?? []).filter(
    (observation) => observationAffectsHealth(observation) && observation.status === "down",
  );
  if (observations.length > 0) {
    return observations.map((observation) => signal({
      code: "required_resource_down",
      severity: "critical",
      reason: `${affectedLabel(observation)} is down`,
      observation,
      details: { evidence: { health_reason: observation.reason } },
    }));
  }
  return health?.status === "down"
    ? [signal({
        code: "project_health_down",
        severity: "critical",
        reason: "Project operational Health is Down",
        details: { evidence: { health_reason: health.reason ?? null } },
      })]
    : [];
}

function failedDeploymentSignals(health) {
  return (health?.observations ?? [])
    .filter((observation) => {
      if (!observationAffectsHealth(observation) || observation.status !== "degraded") {
        return false;
      }
      const evidence = observation.evidence ?? {};
      return evidence.latestDeploymentFailed === true ||
        evidence.latest_deployment_failed === true ||
        ["latest_deployment_failed", "latest_deployment_crashed"]
          .includes(evidence.attentionSignal);
    })
    .map((observation) => signal({
      code: "latest_production_deployment_failed",
      severity: "high",
      reason: `Latest ${providerLabel(observation.provider)} production deployment failed`,
      observation,
      details: {
        evidence: {
          health_reason: observation.reason,
          active_deployment_id:
            observation.evidence?.activeDeploymentId ??
            observation.evidence?.servingDeployment?.id ??
            null,
        },
      },
    }));
}

function materialDegradationSignals(health) {
  return (health?.observations ?? [])
    .filter((observation) =>
      observationAffectsHealth(observation) &&
      observation.status === "degraded" &&
      (observation.evidence?.materialDegradation === true ||
        observation.evidence?.material_degradation === true ||
        observation.evidence?.attentionSignal === "material_degradation"),
    )
    .map((observation) => signal({
      code: "required_resource_materially_degraded",
      severity: "high",
      reason: `${affectedLabel(observation)} is materially degraded`,
      observation,
      details: { evidence: { health_reason: observation.reason } },
    }));
}

function providerInterventionSignals(health) {
  return (health?.observations ?? [])
    .filter((observation) =>
      observationAffectsHealth(observation) &&
      observation.status === "unknown" &&
      INTERVENTION_ERROR_CODES.has(observation.error?.code),
    )
    .map((observation) => {
      const provider = providerLabel(observation.provider);
      const reconnect = [
        "authentication_failed",
        "token_missing",
        "authorization_reconnect_required",
      ].includes(observation.error.code);
      return signal({
        code: "provider_intervention_required",
        severity: "high",
        reason: reconnect
          ? `${provider} monitoring requires reconnection`
          : `${provider} monitoring requires intervention`,
        observation,
        details: {
          evidence: {
            health_reason: observation.reason,
            error_code: observation.error.code,
          },
        },
      });
    });
}

function issueContext(project, item) {
  const itemRepository = normalizedRepository(item.repository);
  const match = (project.githubRepositories ?? []).find((resource) => {
    if (
      item.repositoryDatabaseId &&
      resource.externalId &&
      String(item.repositoryDatabaseId) === String(resource.externalId)
    ) {
      return true;
    }
    try {
      const url = new URL(resource.url);
      return normalizedRepository(url.pathname.replace(/^\/+|\/+$/g, "")) ===
        itemRepository;
    } catch {
      return false;
    }
  });
  if (!match) return null;
  return {
    provider: "github",
    resource: {
      id: match.id ?? item.repositoryDatabaseId ?? item.repositoryId ?? null,
      label: item.repository ?? match.label ?? null,
      url: match.url ?? null,
      externalId: match.externalId ?? item.repositoryDatabaseId ?? null,
    },
    component: match.componentId
      ? { id: match.componentId, name: match.componentName ?? null }
      : null,
  };
}

function bugSignals(project, workflowEvidence) {
  if (workflowEvidence?.status !== "resolved" || !workflowEvidence.readModel) {
    return [];
  }
  return (workflowEvidence.readModel.items ?? [])
    .filter((item) =>
      item.type === "issue" &&
      item.state === "open" &&
      ACTIVE_BUG_STATUSES.has(item.status) &&
      ATTENTION_BUG_PRIORITIES.has(item.priority) &&
      (item.labels ?? []).some(
        (label) => String(label).trim().toLowerCase() === "bug",
      ),
    )
    .flatMap((item) => {
      const context = issueContext(project, item);
      if (!context) return [];
      const severity = ATTENTION_BUG_PRIORITIES.get(item.priority);
      return [signal({
        code: "high_priority_active_bug",
        severity,
        reason: `${item.priority.split(" ")[0]} bug #${item.number} is ${item.status}`,
        details: {
          ...context,
          observed_at: item.updatedAt ?? null,
          evidence: {
            issue_number: item.number,
            issue_title: item.title,
            issue_url: item.url,
            labels: item.labels,
            status: item.status,
            priority: item.priority,
          },
        },
      })];
    });
}

function workflowUnavailable(project, workflowEvidence) {
  if ((project.githubRepositories ?? []).length === 0) return false;
  if (!workflowEvidence) return true;
  if (workflowEvidence.status !== "resolved") return true;
  const readModel = workflowEvidence.readModel;
  return !readModel ||
    !readModel.statusField?.standard ||
    !readModel.priorityField?.standard;
}

function healthUnavailable(health) {
  return health?.status === "unknown";
}

function signalKey(item) {
  return [
    item.code,
    item.provider,
    item.resource?.externalId ?? item.resource?.id,
    item.component?.id,
    item.evidence?.issue_number,
  ].filter(Boolean).join(":");
}

function deduplicateSignals(signals) {
  const seen = new Set();
  return signals.filter((item) => {
    const key = signalKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function strongestSeverity(signals) {
  return signals.reduce(
    (strongest, item) =>
      ATTENTION_SEVERITY_RANK[item.severity] < ATTENTION_SEVERITY_RANK[strongest]
        ? item.severity
        : strongest,
    "normal",
  );
}

function latestObservedAt(signals) {
  return signals.reduce((latest, item) => {
    if (!item.observed_at) return latest;
    const timestamp = Date.parse(item.observed_at);
    if (Number.isNaN(timestamp)) return latest;
    return !latest || timestamp > Date.parse(latest) ? item.observed_at : latest;
  }, null);
}

export function synthesizeProjectAttention({ project, health, workflowEvidence }) {
  const manual = Boolean(project.needsAttention);
  const manualReason = cleanOptionalText(project.attentionSummary) ??
    "Manual attention override";
  const automaticSignals = deduplicateSignals([
    ...downSignals(health),
    ...failedDeploymentSignals(health),
    ...materialDegradationSignals(health),
    ...providerInterventionSignals(health),
    ...bugSignals(project, workflowEvidence),
  ]).sort((left, right) => {
    const severity = ATTENTION_SEVERITY_RANK[left.severity] -
      ATTENTION_SEVERITY_RANK[right.severity];
    return severity || left.reason.localeCompare(right.reason);
  });
  const manualSignal = manual
    ? signal({
        code: "manual_override",
        severity: "normal",
        reason: manualReason,
      })
    : null;
  const reasons = manualSignal
    ? [manualSignal, ...automaticSignals]
    : automaticSignals;

  if (manual) {
    return {
      needs_attention: true,
      source: "manual",
      severity: strongestSeverity(reasons),
      primary_reason: manualReason,
      reasons,
      observed_at: latestObservedAt(reasons),
      availability: {
        health: healthUnavailable(health) ? "unavailable" : "available",
        github_bugs: workflowUnavailable(project, workflowEvidence)
          ? "unavailable"
          : "available",
      },
    };
  }
  if (automaticSignals.length > 0) {
    return {
      needs_attention: true,
      source: "automatic",
      severity: strongestSeverity(automaticSignals),
      primary_reason: automaticSignals[0].reason,
      reasons: automaticSignals,
      observed_at: latestObservedAt(automaticSignals),
      availability: {
        health: healthUnavailable(health) ? "unavailable" : "available",
        github_bugs: workflowUnavailable(project, workflowEvidence)
          ? "unavailable"
          : "available",
      },
    };
  }
  const unavailable = healthUnavailable(health) ||
    workflowUnavailable(project, workflowEvidence);
  return {
    needs_attention: false,
    source: unavailable ? "unavailable" : "none",
    severity: "normal",
    primary_reason: unavailable
      ? "Some attention signals are unavailable"
      : "No current high-confidence attention signals",
    reasons: [],
    observed_at: null,
    availability: {
      health: healthUnavailable(health) ? "unavailable" : "available",
      github_bugs: workflowUnavailable(project, workflowEvidence)
        ? "unavailable"
        : "available",
    },
  };
}

export function attachProjectAttention(projects, workflowEvidenceByProjectId) {
  return projects.map((project) => ({
    ...project,
    attention: synthesizeProjectAttention({
      project,
      health: project.health,
      workflowEvidence: workflowEvidenceByProjectId.get(project.id),
    }),
  }));
}
