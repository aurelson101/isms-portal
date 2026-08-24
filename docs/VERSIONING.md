# Versioning

The application exposes the current version in the footer of every page. During
the `0.9` improvement cycle, every validated release increments only the final
number.

- Current release: `0.9.6`.
- Next releases: `0.9.5`, `0.9.6`, `0.9.7`, and so on.
- Do not use `0.10.0` for the next improvement release.
- `1.0.0` remains reserved for an explicitly approved stable milestone.

Every release change must update `package.json`, `package-lock.json` and
`apps/web/app/version.ts` together. Development changes are grouped into a
release; the version is not incremented once per commit. Multiple changes
validated in the same release produce a single increment of the final number.
