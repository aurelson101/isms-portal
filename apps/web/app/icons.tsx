import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home"
  | "shield"
  | "policy"
  | "procedure"
  | "guide"
  | "folder"
  | "groups"
  | "rules"
  | "documents"
  | "sync"
  | "certificate"
  | "audit"
  | "health"
  | "settings"
  | "download"
  | "search"
  | "add"
  | "grid"
  | "list"
  | "expand"
  | "collapse"
  | "publish"
  | "archive"
  | "restore"
  | "delete";

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v11h14V10M9 21v-7h6v7" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    policy: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
        <path d="M9 12h6" />
      </>
    ),
    procedure: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
    guide: (
      <>
        <path d="M3 5.5A3.5 3.5 0 0 1 6.5 2H11v17H6.5A3.5 3.5 0 0 0 3 22V5.5ZM21 5.5A3.5 3.5 0 0 0 17.5 2H13v17h4.5A3.5 3.5 0 0 1 21 22V5.5Z" />
      </>
    ),
    folder: <path d="M3 6h7l2 2h9v11H3V6Z" />,
    groups: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="10" r="2.5" />
        <path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M15 15c3.5 0 6 1.5 6 5" />
      </>
    ),
    rules: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    documents: (
      <>
        <path d="M6 2h8l4 4v16H6V2Z" />
        <path d="M14 2v5h5M9 12h6M9 16h6" />
      </>
    ),
    sync: (
      <>
        <path d="M20 7h-5V2M20 7a8 8 0 0 0-14-2M4 17h5v5M4 17a8 8 0 0 0 14 2" />
      </>
    ),
    certificate: (
      <>
        <circle cx="12" cy="9" r="6" />
        <path d="m8 14-1 8 5-3 5 3-1-8M9 9l2 2 4-4" />
      </>
    ),
    audit: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
    health: (
      <>
        <path d="M3 12h4l2-5 4 10 2-5h6" />
        <path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-3 3-1 8 8 15 9-7 11-12 8-15Z" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    add: <path d="M12 5v14M5 12h14" />,
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    list: (
      <>
        <path d="M9 6h12M9 12h12M9 18h12" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </>
    ),
    expand: (
      <>
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
        <path d="m3 3 6 6M21 3l-6 6M3 21l6-6M21 21l-6-6" />
      </>
    ),
    collapse: (
      <>
        <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
        <path d="m3 9 6-6M21 9l-6-6M3 15l6 6M21 15l-6 6" />
      </>
    ),
    publish: (
      <>
        <path d="M12 21V7m0 0-5 5m5-5 5 5" />
        <path d="M5 4h14" />
      </>
    ),
    archive: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M3 3h18v4H3zM9 12h6" />
      </>
    ),
    restore: (
      <>
        <path d="M4 10a8 8 0 1 1 2 8" />
        <path d="M4 4v6h6" />
      </>
    ),
    delete: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
