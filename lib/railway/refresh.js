import "server-only";

import { clearRailwayHealthCache } from "../health/providers/railway-connection.js";
import { refreshRailwayDiscovery } from "./connection.js";

export async function refreshRailwayIntegration({
  refreshDiscovery = refreshRailwayDiscovery,
  clearHealthCache = clearRailwayHealthCache,
} = {}) {
  clearHealthCache();
  const result = await refreshDiscovery();
  return result;
}
