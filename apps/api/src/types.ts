import type { Request } from "express";

export type Identity = {
  username: string;
  displayName: string;
  groups: string[];
  source: "demo" | "trusted-proxy" | "system";
};
export type IsmsRequest = Request & {
  identity: Identity;
  correlationId: string;
};
