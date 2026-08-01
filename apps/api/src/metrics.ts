import { Counter, Histogram, register } from "prom-client";

const existing = <T>(name: string) =>
  register.getSingleMetric(name) as T | undefined;

export const httpRequests =
  existing<Counter>("isms_http_requests_total") ||
  new Counter({
    name: "isms_http_requests_total",
    help: "HTTP requests handled by the API",
    labelNames: ["method", "route", "status_class"] as const,
  });

export const httpDuration =
  existing<Histogram>("isms_http_request_duration_seconds") ||
  new Histogram({
    name: "isms_http_request_duration_seconds",
    help: "API HTTP request duration in seconds",
    labelNames: ["method", "route"] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  });

export const antivirusDuration =
  existing<Histogram>("isms_antivirus_scan_duration_seconds") ||
  new Histogram({
    name: "isms_antivirus_scan_duration_seconds",
    help: "ClamAV scan duration in seconds",
    labelNames: ["result"] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  });
