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
| Developer modules, functions, workers, and workflow reference | [developer-reference.md](developer-reference.md) |
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

## Identity, LDAP, certificates, and ACLs

### LDAP and LDAPS

Directory configuration is managed from **Administration -> LDAP
synchronization**. The service account is read-only and is used only to query
users, groups, nested memberships, and the `mail` attribute.

- Prefer **LDAPS on TCP/636**. Use the fully qualified DNS name of each domain
  controller so TLS hostname validation succeeds.
- Import only the public CA certificate or chain in **Administration -> CA
  certificates**. PEM, DER, and PKCS#7 chain exports are accepted; never copy a
  private CA key to ISMS.
- Use the connection **Test** action before synchronization. It checks DNS,
  TCP, TLS chain, hostname, bind, and directory search.
- Synchronization imports the directory groups used by ACLs. It does not change
  Active Directory. A failed or incomplete synchronization must not be followed
  by a directory-group purge.
- Email recipients are resolved from the Active Directory `mail` attribute.
  Accounts or group members without a non-empty valid address are skipped.

### ACL model

Access control is deny-by-default and evaluated server-side for every request.
Navigation visibility is only a convenience and never grants a permission.

ACLs are assigned to AD groups at the document section or category level. The
effective permissions are: `showMenu`, `read`, `search`, `preview`, `download`,
`upload`, `edit`, `publish`, and `archive`. Category access must remain within
its parent section. Test any new rule with the access simulation before making
it available to users.

Administrators have full configuration access. Moderators are configured in
**Configuration -> Moderators** for a local account, AD user, or AD group. They
do not gain administrative configuration access. Their document-management
rights are independently controlled by **Manage**, **Publish**, and
**Archive/delete**; `Manage` is required for the other moderator rights to be
effective.

## Document lifecycle and governance

Documents follow the lifecycle `Draft -> Review -> Published -> Archived ->
Trash`. A new file creates the next version while retaining version history and
audit evidence. The current version remains the distributed file; a permanent
deletion is restricted to administrators and removes related files and metadata.

- Changing a document category from **Edit** changes only metadata. It does not
  create a new version and does not send the publication email.
- The dedicated **Document trash** screen supports restoration and confirmed
  permanent deletion. Restoration returns a document as `Archived` so that it
  requires an explicit publication decision.
- Every published document enters an annual review cycle after 365 days without
  a newer version. Only eligible administrators and moderators receive the
  English review notification. Publishing a new version starts a new annual
  cycle.
- Approvals, review decisions, reports, publication, archival, deletion, and
  category changes are recorded in the audit trail.

## Alerts, approvals, and email

Alert channels are configured under **Supervision -> Alert channel
configuration**. Microsoft Graph and SMTP are independent channels. Store
credentials and certificates on the server or in the enterprise secret manager,
never in Git.

For Microsoft Graph, use an Entra application with an X.509 certificate and
application permission `Mail.Send` granted by tenant administrator consent.
Restrict the application in Exchange to the approved shared sender mailbox.
Record the Tenant ID, Client ID, sender mailbox, private-key path, and
certificate thumbprint in the protected channel configuration, then run the
recipient test.

Graph and SMTP notifications use responsive English HTML templates. Publication
and new-version emails go only to readers resolved through the relevant ACL and
AD groups. Approval, review, annual-review, and report notifications go to the
eligible administrators and moderators. The notification delivery history and
retry controls are available in Supervision.

## Useful commands

```bash
docker compose ps
curl -fsS http://127.0.0.1:8080/api/health/ready
docker compose logs -f api worker frontend
docker compose config --quiet
./scripts/verify-backup.sh backups/<timestamp>
```
