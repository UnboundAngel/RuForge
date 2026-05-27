/** Prefix internal site paths with /m for the mobile page tree. */
export function mobileHref(path: string): string {
  if (path.startsWith('http')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/m' || normalized.startsWith('/m/')) return normalized;
  return `/m${normalized}`;
}
