import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const cases = [
  [
    "complete local copy",
    "const x={en:{a:'Unique label'},es:{a:'Etiqueta'},sk:{a:'Popis'}};",
    true,
  ],
  [
    "complete shared copy",
    "const x={en:{a:'All'},es:{a:'Todo'},sk:{a:'Vsetko'}};",
    true,
  ],
  ["boolean XML values", "['1','true'].includes('1');", true],
  ["CSS values", "['right','center'].includes('center');", true],
  ...["test.ts", "spec.ts", "test.tsx", "spec.tsx"].map((extension) => [
    `excludes ${extension} fixtures`,
    "const x=[['fixture','Not an interface message']];",
    true,
    `fixture.${extension}`,
  ]),
  ["blank copy", "translate('fr',' ',' ');", true],
  ["known shared translation", "translate('fr','Tout','All');", true],
  ["missing Spanish locale", "const x={en:{a:'All'},sk:{a:'Vsetko'}};", false],
  ["missing Slovak locale", "const x={en:{a:'All'},es:{a:'Todo'}};", false],
  [
    "empty Spanish copy",
    "const x={en:{a:'All'},es:{a:''},sk:{a:'Vsetko'}};",
    false,
  ],
  [
    "empty Slovak copy",
    "const x={en:{a:'All'},es:{a:'Todo'},sk:{a:' '}};",
    false,
  ],
  [
    "missing Spanish key",
    "const x={en:{a:'All'},es:{},sk:{a:'Vsetko'}};",
    false,
  ],
  ["missing Slovak key", "const x={en:{a:'All'},es:{a:'Todo'},sk:{}};", false],
  [
    "nonliteral Spanish copy",
    "const x={en:{a:'All'},es:{a:123},sk:{a:'Vsetko'}};",
    false,
  ],
  [
    "nonliteral Slovak copy",
    "const x={en:{a:'All'},es:{a:'Todo'},sk:{a:false}};",
    false,
  ],
  [
    "unknown shared translation",
    "translate('fr','Inconnu','Unique missing translation');",
    false,
  ],
  [
    "unknown interface tuple",
    "const x=[['Inconnu','Unique missing tuple']];",
    false,
  ],
];

test("interface translation validation regressions", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "isms-i18n-"));
  const app = path.join(temp, "apps/web/app");
  try {
    fs.mkdirSync(app, { recursive: true });
    fs.cpSync(path.join(root, "apps/web/app/i18n"), path.join(app, "i18n"), {
      recursive: true,
    });
    for (const [name, source, valid, filename = "fixture.ts"] of cases) {
      await t.test(name, () => {
        const file = path.join(app, filename);
        fs.writeFileSync(file, source);
        try {
          const result = spawnSync(
            process.execPath,
            [path.join(root, "scripts/check-i18n.mjs")],
            {
              cwd: temp,
              encoding: "utf8",
              timeout: 30000,
            },
          );
          assert.ifError(result.error);
          assert.equal(
            result.status === 0,
            valid,
            result.stderr || result.stdout,
          );
          if (!valid)
            assert.match(result.stderr, /Missing interface translations/);
        } finally {
          fs.unlinkSync(file);
        }
      });
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
