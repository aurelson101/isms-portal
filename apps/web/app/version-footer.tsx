import { APP_VERSION } from "./version";

export function VersionFooter() {
  return (
    <footer className="version-footer" aria-label={`Version ${APP_VERSION}`}>
      Version {APP_VERSION}
    </footer>
  );
}
