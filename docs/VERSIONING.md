# Versioning

The application exposes the current version in the footer of every page. During
the `0.9` improvement cycle, every validated release increments only the final
number.

- Current application version: `0.9.63`; consult GitHub Releases for published tags.
- Next improvement release: `0.9.64`, then `0.9.65`, and so on.
- Do not use `0.10.0` for the next improvement release.
- `1.0.0` remains reserved for an explicitly approved stable milestone.

Every release change must update `package.json`, `package-lock.json` and
`apps/web/app/version.ts` together. Development changes are grouped into a
release; the version is not incremented once per commit. Multiple changes
validated in the same release produce a single increment of the final number.

The **Validated release** workflow runs from `main`. It requires a new tag whose
core version matches `package.json` (for example `v0.9.64` or `v0.9.64-rc.1` after
the version bump). CI quality/build, isolated Docker acceptance, performance and
image checks must succeed before tag creation and publication. Tags are created
atomically for the tested commit and never overwritten. The source ZIP includes
a SHA-256 checksum. Failing formatting or dead-code checks block publication.
