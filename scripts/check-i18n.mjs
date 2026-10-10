import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("apps/web/app");
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  new Function("require", "exports", compiled.outputText)((name) => load(path.resolve(path.dirname(file), name + ".ts")), exports);
  return exports;
}
const { portalCatalog, adminEnglishCatalog } = load(path.join(root, "i18n/catalogs.ts"));
const { spanishMessages } = load(path.join(root, "i18n/spanish-messages.ts"));
const { additionalSpanishMessages } = load(path.join(root, "i18n/additional-messages.ts"));
const { spanishTemplates } = load(path.join(root, "i18n/spanish-templates.ts"));
const spanish = { ...spanishMessages, ...additionalSpanishMessages, ...spanishTemplates };
const { slovakMessages } = load(path.join(root, "i18n/slovak-messages.ts"));
const missing = new Set();
const check = text => {
  if (!text.trim()) return;
  if (!Object.hasOwn(spanish, text)) missing.add(`ES: ${text}`);
  if (!Object.hasOwn(slovakMessages, text)) missing.add(`SK: ${text}`);
};
for (const key of Object.keys(spanish)) {
  check(key);
  const placeholders = text => JSON.stringify((text.match(/\{\d+\}/g) || []).sort());
  if (Object.hasOwn(slovakMessages, key) && placeholders(key) !== placeholders(slovakMessages[key])) throw Error(`Invalid Slovak placeholders: ${key}`);
}
for (const text of Object.values(adminEnglishCatalog)) check(text);
for (const key of Object.keys(portalCatalog.en)) {
  if (!portalCatalog.fr[key] || !portalCatalog.es[key] || !portalCatalog.sk[key]) throw Error(`Incomplete portal key: ${key}`);
  check(portalCatalog.en[key]);
}
function literals(node) {
  if (ts.isStringLiteral(node)) check(node.text);
  else if (ts.isNoSubstitutionTemplateLiteral(node)) check(node.text);
  else if (ts.isTemplateExpression(node)) check(node.head.text + node.templateSpans.map((span, index) => `{${index}}${span.literal.text}`).join(""));
  else if (ts.isConditionalExpression(node)) { literals(node.whenTrue); literals(node.whenFalse); }
}
for (const file of fs.readdirSync(root, { recursive: true }).filter(file => /\.tsx?$/.test(file) && !file.startsWith("i18n"))) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      if (name === "translate" && node.arguments.length === 3) literals(node.arguments[2]);
      if (name === "t" && node.arguments.length === 2) literals(node.arguments[1]);
      if (name === "t" && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
        const text = node.arguments[0].text;
        if (!Object.hasOwn(adminEnglishCatalog, text)) missing.add(`EN: ${text}`);
      }
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === "en" && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) if (ts.isPropertyAssignment(property)) literals(property.initializer);
    }
    if (ts.isArrayLiteralExpression(node) && node.elements.length === 2 && node.elements.every(ts.isStringLiteral) && node.elements[1].text.length > 2) check(node.elements[1].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (missing.size) throw Error(`Missing interface translations:\n${[...missing].sort().join("\n")}`);
console.log(`FR/EN/ES/SK catalog coverage verified (${Object.keys(spanish).length} Spanish and ${Object.keys(slovakMessages).length} Slovak messages).`);
