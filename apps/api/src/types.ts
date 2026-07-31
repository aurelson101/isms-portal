import type { Request } from "express";

export type Identity = {
  username: string;
  displayName: string;
  groups: string[];
};
export type IsmsRequest = Request & {
  identity: Identity;
  correlationId: string;
};
