import type { Request } from "express";

export type Identity = {
  username: string;
  displayName: string;
  groups: string[];
  source:
    | "trusted-proxy"
    | "directory-session"
    | "local-admin"
    | "anonymous"
    | "system";
  sessionExpiresAt?: string | null;
  profilePhoto?: string | null;
};
export type IsmsRequest = Request & {
  identity: Identity;
  correlationId: string;
};
