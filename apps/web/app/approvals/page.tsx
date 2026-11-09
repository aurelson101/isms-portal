"use client";

import { useEffect, useState } from "react";
import { getPortalIdentity } from "../auth-session";
import ApprovalsPanel from "./approvals-panel";

export default function ApprovalsPage() {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    let active = true;
    void getPortalIdentity<{ isAdmin?: boolean }>()
      .then((identity) => {
        if (!active) return;
        if (identity.isAdmin) {
          const target = window.location.hash.slice(1);
          const query = target ? `?request=${encodeURIComponent(target)}` : "";
          window.location.replace(`/admin${query}#approvals`);
        } else setStandalone(true);
      })
      .catch(() => {
        if (active) setStandalone(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return standalone ? <ApprovalsPanel /> : <p role="status">…</p>;
}
