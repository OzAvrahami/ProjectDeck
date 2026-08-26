export function isPublicAccessPath(pathname) {
  return pathname === "/login";
}

export function accessDecision({ pathname, configured, sessionValid }) {
  if (isPublicAccessPath(pathname)) {
    return configured && sessionValid ? "redirect_home" : "allow";
  }

  return configured && sessionValid ? "allow" : "redirect_login";
}
