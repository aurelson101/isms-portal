import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanupPlan } from "./package-cleanup.mjs";
const current = "a".repeat(40);
const previous = "b".repeat(40);
const repository = "example/isms-portal";
const pkg = { repository: { full_name: repository } };
const version = (id, name, tags) => ({
  id,
  name,
  metadata: { container: { tags } },
});
const latest = () => version(1, "sha256:current", ["latest", current]);
const old = () => version(2, "sha256:old", [previous]);
const plan = (versions) =>
  cleanupPlan(pkg, versions, repository, current, previous);
test("selects only the named previous index, not child manifests or signatures", () => {
  assert.deepEqual(
    plan([
      latest(),
      old(),
      version(3, "sha256:child", []),
      version(4, "sha256:sig", ["sha256-current.sig"]),
    ]),
    { id: 2, digest: "sha256:old", latestId: 1 },
  );
});
test("refuses another repository", () => {
  assert.throws(() =>
    cleanupPlan(
      { repository: { full_name: "other/repo" } },
      [latest(), old()],
      repository,
      current,
      previous,
    ),
  );
});
test("refuses invalid or identical commit tags", () => {
  for (const tag of ["latest", "", current, "../other"])
    assert.throws(() =>
      cleanupPlan(pkg, [latest(), old()], repository, current, tag),
    );
});
test("refuses missing or duplicate latest tags", () => {
  assert.throws(() => plan([old()]));
  assert.throws(() => plan([latest(), latest(), old()]));
});
test("refuses stale current images", () => {
  assert.throws(() =>
    plan([version(1, "sha256:current", ["latest", "c".repeat(40)]), old()]),
  );
});
test("refuses missing or ambiguous old versions", () => {
  assert.throws(() => plan([latest()]));
  assert.throws(() => plan([latest(), old(), old()]));
});
test("protects additional release and signature tags", () => {
  for (const tag of ["v1.0.0", "latest", "sha256-current.sig"])
    assert.throws(() =>
      plan([latest(), version(2, "sha256:old", [previous, tag])]),
    );
});
test("protects a digest shared with the current version", () => {
  assert.throws(() =>
    plan([latest(), version(2, "sha256:current", [previous])]),
  );
});
test("protects the current version identifier", () => {
  assert.throws(() => plan([latest(), version(1, "sha256:old", [previous])]));
});
test("rejects non-numeric deletion identifiers", () => {
  assert.throws(() =>
    plan([latest(), version("../latest", "sha256:old", [previous])]),
  );
});
