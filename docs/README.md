# Developer Handover

This folder is the operational entry point for a developer taking over ISMS
Portal. Read this page before changing infrastructure, authentication, access
control, document storage, or notification delivery.

## System at a glance

ISMS Portal is a Docker Compose application:

```text
HTTPS reverse proxy -> frontend (Next.js) -> API (NestJS) -> PostgreSQL
                                                |-> Redis / BullMQ worker
                                                |-> ClamAV
                                                |-> persistent document volume
```

The frontend is stateless. PostgreSQL stores configuration, ACLs, document
metadata, audit records, and notification settings. The persistent document
volume contains original and distributed document files. Treat the database and
document volume as a single backup and restore unit.

## First-day checklist

1. Read [architecture.md](architecture.md) and [security.md](security.md).
2. Confirm the effective Compose configuration and service health:

   ```bash
   docker compose config --quiet
   docker compose ps
   curl -fsS http://127.0.0.1:8080/api/health/ready
   ```

3. Review environment variables without exposing secret values. `.env`, private
   keys, `credentials.txt`, and production Compose overrides are never committed.
4. Validate a backup before changing schema, storage, ACLs, or authentication:

   ```bash
   ./scripts/backup.sh backups/<timestamp>
   ./scripts/verify-backup.sh backups/<timestamp>
   ```

5. Check the latest API, worker, and proxy logs after a deployment:

   ```bash
   docker compose logs --since 15m api worker reverse-proxy
   ```

## Documentation map

| Subject | Reference |
| --- | --- |
| Installation and host prerequisites | [installation.md](installation.md), [docker.md](docker.md) |
| Architecture and service boundaries | [architecture.md](architecture.md) |
| Active Directory and LDAPS | [active-directory.md](active-directory.md), [ldaps-certificates.md](ldaps-certificates.md) |
| Entra ID / SSO | [sso.md](sso.md) |
| Access model and ACLs | [permissions.md](permissions.md) |
| Administrator operations | [administration.md](administration.md) |
| Security controls and incident response | [security.md](security.md), [troubleshooting.md](troubleshooting.md) |
| Backup, restore, and functional restore test | [backup-restore.md](backup-restore.md) |
| API routes | [routes.md](routes.md) |
| Release versioning | [VERSIONING.md](VERSIONING.md) |
| User-facing behavior | [user-guide-en.md](user-guide-en.md), [user-guide-fr.md](user-guide-fr.md) |

## Change and deployment procedure

1. Make the smallest scoped change and keep secrets out of source control.
2. Build the affected services. API changes require rebuilding both `api` and
   `worker`; frontend changes require rebuilding `frontend`.
3. Apply Prisma migrations through the API container startup process. Do not use
   `prisma db push` against production.
4. Recreate only affected services, then wait for health checks:

   ```bash
   docker compose build api worker frontend
   docker compose up -d --no-deps --force-recreate --wait api worker frontend
   docker compose ps
   curl -fsS http://127.0.0.1:8080/api/health/ready
   ```

5. Exercise the changed workflow with a least-privileged test account and check
   the audit log. For email changes, use the configured channel test before
   generating a business event.

## Key operational rules

- Keep Docker port `8080` local in production; publish HTTPS through the host
  reverse proxy only.
- Prefer LDAPS. The service account is read-only and its bind secret is
  encrypted by the application.
- Document ACL enforcement is server-side and deny-by-default. Do not rely on
  navigation visibility as an authorization control.
- Microsoft Graph uses an application certificate and `Mail.Send`; restrict it
  to the approved sender mailbox in Exchange. SMTP remains an independent
  fallback channel.
- Backups must contain both PostgreSQL and the document volume. Test restores
  periodically with `scripts/test-restore-functional.sh`.
- Do not remove Docker volumes, databases, or document files during routine
  image cleanup.

## Useful commands

```bash
docker compose ps
curl -fsS http://127.0.0.1:8080/api/health/ready
docker compose logs -f api worker frontend
docker compose config --quiet
./scripts/verify-backup.sh backups/<timestamp>
```
