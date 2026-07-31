import type { Request } from "express";

export type Identity = {
  username: string;
  displayName: string;
  groups: string[];
  source: "demo" | "trusted-proxy" | "system";
  sessionExpiresAt?: string | null;
};
export type IsmsRequest = Request & {
  identity: Identity;
  correlationId: string;
};
