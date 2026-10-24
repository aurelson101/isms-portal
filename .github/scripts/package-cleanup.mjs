import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function cleanupPlan(pkg, versions, repository, currentSha, oldTag) {
  if (
    !/^[a-f0-9]{40}$/.test(currentSha) ||
    !/^[a-f0-9]{40}$/.test(oldTag) ||
    oldTag === currentSha
  )
    throw new Error("Distinct full commit hashes are required");
  if (pkg.repository?.full_name !== repository)
    throw new Error("Package belongs to another repository");
  const tags = (version) => version.metadata?.container?.tags ?? [];
  const latest = versions.filter((version) => tags(version).includes("latest"));
  if (latest.length !== 1 || !tags(latest[0]).includes(currentSha))
    throw new Error("Latest publication is not the current main commit");
  const candidates = versions.filter((version) =>
    tags(version).includes(oldTag),
  );
  if (candidates.length !== 1)
    throw new Error("Exactly one previous tagged version must exist");
  const old = candidates[0];
  if (
    !Number.isSafeInteger(old.id) ||
    old.id <= 0 ||
    old.id === latest[0].id ||
    old.name === latest[0].name
  )
    throw new Error("Cannot delete the current image");
  if (tags(old).length !== 1 || tags(old)[0] !== oldTag)
    throw new Error("Previous image still has protected tags");
  return { id: old.id, digest: old.name, latestId: latest[0].id };
}

async function main() {
  const {
    GITHUB_TOKEN: token,
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: currentSha,
    OLD_TAG: oldTag,
  } = process.env;
  if (!token || !repository || !currentSha || !oldTag)
    throw new Error("Missing workflow context");
  const headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  async function api(path, method = "GET", missing = false) {
    const response = await fetch("https://api.github.com" + path, {
      method,
      headers,
      redirect: "error",
    });
    if (missing && response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        "GitHub API " + method + " failed: HTTP " + response.status,
      );
    return response.status === 204 ? null : response.json();
  }
  const repo = await api("/repos/" + repository);
  const ownerPath = repo.owner.type === "Organization" ? "orgs" : "users";
  const head = () => api("/repos/" + repository + "/commits/main");
  if ((await head()).sha !== currentSha)
    throw new Error("Workflow is not running at current main");
  const runs = await api(
    "/repos/" +
      repository +
      "/actions/workflows/supply-chain.yml/runs?head_sha=" +
      currentSha +
      "&per_page=10",
  );
  if (
    !runs.workflow_runs.some(
      (run) =>
        run.head_sha === currentSha &&
        run.status === "completed" &&
        run.conclusion === "success",
    )
  )
    throw new Error("The current image publication has not passed");
  const plans = [];
  for (const name of ["isms-portal-api", "isms-portal-web"]) {
    const path =
      "/" +
      ownerPath +
      "/" +
      encodeURIComponent(repo.owner.login) +
      "/packages/container/" +
      name;
    const pkg = await api(path);
    const versions = await api(path + "/versions?per_page=100");
    plans.push({
      name,
      path,
      ...cleanupPlan(pkg, versions, repository, currentSha, oldTag),
    });
  }
  // Never select untagged child manifests or signatures; validate both packages before deletion.
  for (const plan of plans) {
    if ((await head()).sha !== currentSha)
      throw new Error("Main changed; cleanup stopped");
    const pkg = await api(plan.path);
    const versions = await api(plan.path + "/versions?per_page=100");
    const checked = cleanupPlan(pkg, versions, repository, currentSha, oldTag);
    if (checked.id !== plan.id || checked.digest !== plan.digest)
      throw new Error("Previous version changed");
    await api(plan.path + "/versions/" + plan.id, "DELETE");
    if (await api(plan.path + "/versions/" + plan.id, "GET", true))
      throw new Error("Version was not deleted");
    const remaining = await api(plan.path + "/versions?per_page=100");
    const latest = remaining.find((version) =>
      version.metadata?.container?.tags?.includes("latest"),
    );
    if (
      latest?.id !== plan.latestId ||
      !latest.metadata.container.tags.includes(currentSha)
    )
      throw new Error("Latest image changed during cleanup");
    console.log("Deleted previous version", plan.name, oldTag, plan.id);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        "- " +
          plan.name +
          ": removed " +
          oldTag +
          "; current main preserved.\n",
      );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
