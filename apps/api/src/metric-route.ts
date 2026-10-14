export function metricRoute(path: unknown) {
  return typeof path === "string" && path.startsWith("/") ? path : "unmatched";
}
