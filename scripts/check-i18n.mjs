import fs from "node:fs";

const catalog = fs.readFileSync("apps/web/app/i18n/catalogs.ts", "utf8");
const portal = fs.readFileSync("apps/web/app/page.tsx", "utf8");
const admin = fs.readFileSync("apps/web/app/admin/page.tsx", "utf8");

if (!/catalogVersion = \d+/.test(catalog)) {
  throw new Error("The translation catalog must expose a numeric version.");
}
if (
  !catalog.includes("portalCatalog") ||
  !catalog.includes("adminEnglishCatalog")
) {
  throw new Error("FR/EN portal and administration catalogs are required.");
}
if (/const copy\s*=/.test(portal)) {
  throw new Error("Portal translations must remain in the versioned catalog.");
}

const bilingualLiteral =
  /t\(\s*"(?:\\.|[^"\\])*"\s*,\s*"(?:\\.|[^"\\])*"\s*\)/g;
const remaining = admin.match(bilingualLiteral) || [];
if (remaining.length) {
  throw new Error(
    `${remaining.length} literal admin translation(s) remain outside the catalog.`,
  );
}

const portalLocales = [...catalog.matchAll(/^\s{2}(fr|en): \{$/gm)].map(
  (match) => match[1],
);
if (!portalLocales.includes("fr") || !portalLocales.includes("en")) {
  throw new Error("Portal catalog must contain both fr and en locales.");
}

console.log("Translation catalogs are versioned and complete for FR/EN.");
