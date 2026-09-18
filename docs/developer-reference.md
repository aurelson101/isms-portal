# Developer Reference

This reference explains where features live and how the runtime parts work.
The live, exhaustive OpenAPI contract is available at `/api/docs` after an
administrator signs in. It is generated from the NestJS controllers; use it as
the source of truth for request and response schemas.

## Source layout

| Path | Responsibility |
| --- | --- |
| `apps/web/app` | Next.js user portal, explorer, personal workspace, and administration UI |
| `apps/api/src/controllers.ts` | Portal, document, admin, directory, certificate, and health endpoints |
| `apps/api/src/auth.controller.ts` | Local admin login, admin accounts, AD-admin and moderator assignment |
| `apps/api/src/approvals.controller.ts` | Approval and review inbox decisions |
| `apps/api/src/governance.controller.ts` | Governance registers, reviews, actions, evidence, and exports |
| `apps/api/src/user-tools.controller.ts` | User preferences, reports, saved searches, notifications, and operations inbox |
| `apps/api/src/worker.ts` | LDAP scheduler, annual review scheduler, BullMQ workers |
| `apps/api/prisma/schema.prisma` | Data model; every durable schema change requires a Prisma migration |
| `deploy/` | Nginx, monitoring, systemd cleanup timer, Compose examples, and Kubernetes manifest |
| `scripts/` | Secrets, host preparation, backup, restore, and validation tools |

## API route groups

All API routes are published under `/api`. Unauthorized document resources
return `404` rather than revealing their existence.

| Prefix | Main functions |
| --- | --- |
| `/api/health/*`, `/api/metrics` | Liveness, readiness, dependency details, Prometheus metrics |
| `/api/auth/*` | Local-admin authentication, logout, public sign-in configuration |
| `/api/me` | Current identity, AD-derived groups, authorized sections and preferences |
| `/api/documents/*` | Search, filters, metadata, viewer content, download, upload, publish, archive, restore, delete, metadata and category changes |
| `/api/approvals/*`, `/api/reviews/*` | Approval inbox, review inbox, accept/reject decisions and history |
| `/api/incident-reports/*` | Annual incident reports available to authorized users |
| `/api/user-tools/*` | Favorites, activity, saved searches, access requests, issue reports, user notifications, preferences and template tests |
| `/api/branding/*` | Portal branding read and administrator update |
| `/api/admin/*` | Dashboard, groups, access rules, sections, categories, documents, trash, audit, settings and service health |
| `/api/admin/accounts/*` | Administrator accounts, AD groups, sessions, MFA, profile and moderator permissions |
| `/api/admin/directory-connections/*` | LDAP/LDAPS connection CRUD, test, synchronization and group search |
| `/api/admin/certificates/*` | Public CA import, validation, export and removal |
| `/api/admin/governance/*` | Controls, risks, exceptions, corrective actions, document reviews, audit exports and evidence |
| `/api/admin/operations/*` | Shared moderator/administrator work items and workflow actions |

Consult [routes.md](routes.md) for the concise external route list and
`/api/docs` for endpoint-level request contracts before writing a client.

## Core services and functions

| Service | Responsibility |
| --- | --- |
| `AuthorizationService` | Evaluates effective ACLs for AD groups, sections, categories and moderator permissions |
| `DirectoryService` | Connects to LDAP/LDAPS, resolves nested groups, users and `mail` recipients |
| `AuthService` | Validates sessions and creates the effective admin/moderator identity groups |
| `StorageService` | Persists document files on the protected volume and removes files after controlled deletion |
| `AntivirusService` | Scans PDF, DOCX and XLSX uploads with ClamAV before lifecycle changes |
| `WatermarkService` | Produces the protected distributed file for sensitive documents |
| `AuditService` | Records durable actions with actor, resource, result and correlation ID |
| `NotificationService` | Converts audited business events into BullMQ email jobs and resolves recipients |
| `AlertDeliveryService` | Delivers Graph or SMTP notifications, tests channels and retains delivery status |
| `SensitiveApprovalService` | Creates and resolves sensitive-operation approval requests |
| `ObservabilityService` | Supplies health checks, counters, metrics and alert policy state |
| `CryptoService` | Encrypts sensitive persisted configuration values |

## Background jobs

`worker.ts` runs independently from the API. It processes LDAP synchronization
jobs and email jobs through Redis/BullMQ. Its scheduler runs every minute and:

- starts configured LDAP/LDAPS synchronizations when due;
- removes expired temporary access grants;
- creates governance review work for due risk exceptions;
- identifies published document versions older than 365 days and queues the
  annual-review email only for eligible moderators and administrators.

Email jobs retry with exponential backoff. A successful annual-review delivery
is recorded against the current version so it is not sent repeatedly; a newly
published version begins a new cycle.

## Business workflows

### Documents

1. A user with `upload` deposits a PDF, DOCX, or XLSX into an authorized
   section/category.
2. ClamAV scans the upload. Clean files become `Draft`; unsafe files are
   quarantined.
3. A user with `publish` changes a draft to `Published`. Reader ACL audiences
   receive the publication email.
4. A new file creates the next version. Previous version evidence is retained.
5. `Archive` hides a document from normal catalog use. `Delete` sends it to
   trash. An administrator can restore it or permanently delete files and data.
6. A metadata or category move never creates a version. A category-only move
   does not send a publication notification.

### Approvals and reports

Approval, document-review, access-request, and issue-report records are
durable database objects with requestor, decision, comment, timestamps and
audit events. The requester cannot approve their own review. Mail recipients
are resolved from AD mail attributes, with empty addresses excluded.

### Notification routing

- Published documents and published new versions: readers granted by ACLs.
- Drafts, approvals, annual review, governance, and reports: eligible
  administrators/moderators according to workflow.
- Decisions: requester and relevant assigned staff.

All templates are English responsive HTML. Graph and SMTP are configured and
tested independently in Supervision.

## Development safety rules

- Add a Prisma migration for every schema change and deploy it through the API
  container. Never use `prisma db push` in production.
- Preserve authorization checks in the API even when a UI action is hidden.
- Rebuild `api` and `worker` together after API changes; rebuild `frontend` for
  UI-only changes.
- Validate readiness, the changed route, audit event, and email test after a
  deployment.
- Do not commit `.env`, private certificates, passwords, database dumps, or
  document storage.
