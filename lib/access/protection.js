export function isPublicAccessPath(pathname) {
  return pathname === "/login" || pathname === "/api/health";
}

export function accessDecision({ pathname, configured, sessionValid }) {
  if (pathname === "/api/health") {
    return "allow";
  }

  if (isPublicAccessPath(pathname)) {
    return configured && sessionValid ? "redirect_home" : "allow";
  }

  return configured && sessionValid ? "allow" : "redirect_login";
}
