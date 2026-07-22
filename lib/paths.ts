/** Must match next.config.ts `basePath`. */
export const BASE_PATH = "/vmi" as const;

/**
 * Prefix an app-absolute path with basePath.
 * - appPath("/api/health") → "/vmi/api/health"
 * - appPath("/") → "/vmi/"
 * - leaves http(s) and already-prefixed paths unchanged
 */
export function appPath(path: string): string {
  if (!path) return BASE_PATH;
  if (/^https?:\/\//i.test(path)) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") return `${BASE_PATH}/`;
  return `${BASE_PATH}${normalized}`;
}
