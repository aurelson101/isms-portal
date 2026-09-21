# Optional document storage

The primary document volume remains the default for every upload. Existing
documents are not moved. Optional targets are managed by administrators under
**Configuration > Storage**. This does not change document ACLs, antivirus
scanning, approval workflows or notification recipients.

## Configure a target

1. Add a named S3-compatible target or an SMB/CIFS mount.
2. Save, then **Test connection**. The test writes a random probe, verifies its
   bytes, then deletes it. No business document is used or overwritten.
3. After a successful test, enable **Available for uploads**.
4. The target becomes an optional choice in the user and administrator upload
   forms. Leaving the default selected continues to use the primary volume.

Only administrators can configure/test targets. S3 keys are encrypted using the
existing `ENCRYPTION_KEY` and are never returned to the browser or audit log.
Blank credential fields on edit preserve the current keys. Rotating keys
disables new uploads until the target is tested and enabled again.

Destinations cannot be edited or deleted: create another target for a different
bucket, endpoint or share. Disabling a target only stops new uploads; existing
files and their watermarked copies remain readable and removable. Keep its
credentials valid until all its documents have been permanently removed.

## S3 compatible

Use a private, pre-existing bucket and an HTTPS endpoint with a trusted
certificate, the correct region, and optionally a dedicated key prefix.
Path-style addressing is available for compatible providers such as MinIO.
Azure Blob needs an S3-compatible gateway, not its native Blob endpoint.
Allow only object read/write/delete on the selected bucket/prefix. Do not make
the bucket public. A remote failure never causes a fallback to primary storage.

Provider-side versioning, object lock and retention are independent of ISMS:
an S3 delete may create a delete marker instead of removing older object
versions. Configure lifecycle rules and backup retention on the provider.

## SMB/CIFS

Mount the share on the Linux host before starting Docker. Keep Windows/share
credentials in a root-readable OS credentials file, not in the application or
Compose file. Use SMB3 and appropriate encryption, and grant the container UID
read/write/delete access. Determine the UID/GID with `docker compose exec api id`.

Bind the mounted directory to the same path in every API container that uses
it, for example in a separate local Compose override:

```yaml
services:
  api:
    volumes:
      - type: bind
        source: /mnt/isms-documents
        target: /data/smb/documents
        bind:
          create_host_path: false
  worker:
    volumes:
      - type: bind
        source: /mnt/isms-documents
        target: /data/smb/documents
        bind:
          create_host_path: false
```

Enter `documents` as the mount name in the interface. `DOCUMENT_SMB_ROOT`
defaults to `/data/smb`. The API checks that the destination is actually on a
CIFS filesystem; an ordinary directory or symlink is rejected. A missing mount
must be fixed on the host, then the containers recreated and the target retested.

## Operations and implementation

- `GET/POST /api/admin/storage-targets`: list safe configurations / create.
- `PUT /api/admin/storage-targets/:id`: rename, rotate keys, enable/disable.
- `POST /api/admin/storage-targets/:id/test`: read/write/delete probe.
- `GET /api/admin/storage-targets/options`: upload choices for admin sessions.
- `GET /api/storage-options?spaceId=...`: choices after upload/edit ACL checks.
- `storageTargetId` in document multipart uploads is optional; `primary` is
  always the default. Invalid, disabled or untested targets are rejected.
- `StorageTargetsService` uses `ApplicationSetting` keys prefixed with
  `document-storage.target.`. Configuration updates use revision checks.
- `StorageService` routes `targets/<uuid>/<key>` to the saved target; legacy
  object keys keep using the primary volume. No database migration is required.
- `WatermarkService` stores derived files on the original file's target.

Back up PostgreSQL, `ENCRYPTION_KEY`, primary files **and all optional targets**
as a consistent set. The existing `scripts/backup.sh` only copies the primary
volume; arrange provider/NAS backups separately and test recovery.

Shared storage alone does not turn ISMS into a cluster. Multiple nodes also
need shared PostgreSQL/Redis, consistent secrets/configuration, and access to
all storage used by existing documents. Local primary volumes must not diverge.
