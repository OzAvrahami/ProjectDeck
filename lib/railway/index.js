import "server-only";

export function isRailwayConfigured() {
  return Boolean(process.env.RAILWAY_TOKEN);
}
