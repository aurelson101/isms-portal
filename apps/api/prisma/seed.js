const { PrismaClient } = require("@prisma/client");
const { createHash } = require("crypto");
const { mkdir, writeFile } = require("fs/promises");
const { dirname, resolve, sep } = require("path");

const prisma = new PrismaClient();
const storageRoot = resolve(
  process.env.DOCUMENT_STORAGE_PATH || "/data/documents",
);

async function store(objectKey, content) {
  const target = resolve(storageRoot, objectKey);
  if (!target.startsWith(`${storageRoot}${sep}`))
    throw new Error("Invalid demo document key");
  await mkdir(dirname(target), { recursive: true, mode: 0o750 });
  await writeFile(target, content, { mode: 0o640 });
}

const groups = [
  ["Domain Users", "CN=Domain Users,DC=demo,DC=local"],
  ["ITAD", "CN=ITAD,DC=demo,DC=local"],
  ["HRAD", "CN=HRAD,DC=demo,DC=local"],
  ["FINANCEAD", "CN=FINANCEAD,DC=demo,DC=local"],
  ["MANAGEMENTAD", "CN=MANAGEMENTAD,DC=demo,DC=local"],
  ["ISMS-ADMINS", "CN=ISMS-ADMINS,DC=demo,DC=local"],
  ["ISMS-LOCAL-ADMINS", "CN=ISMS-LOCAL-ADMINS,DC=demo,DC=local"],
];

const spaces = [
  ["general", "Documents généraux", "General documents", "Domain Users"],
  ["it", "IT", "IT", "ITAD"],
  ["hr", "Ressources humaines", "Human resources", "HRAD"],
  ["finance", "Finance", "Finance", "FINANCEAD"],
  ["management", "Direction", "Management", "MANAGEMENTAD"],
];

function pdf(title, language) {
  const safe = `${title} - ${language}`
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/[()\\]/g, "\\$&");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${safe.length + 42} >>\nstream\nBT /F1 18 Tf 72 700 Td (${safe}) Tj ET\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

async function ensureDemoVersion(documentId, locale, title) {
  const objectKey = `demo/${documentId}/${locale}/v1.pdf`;
  const content = pdf(title, locale.toUpperCase());
  const sha256 = createHash("sha256").update(content).digest("hex");
  await store(objectKey, content);
  const storedFile = await prisma.storedFile.upsert({
    where: { objectKey },
    update: {
      originalName: `${documentId}-${locale}.pdf`,
      mimeType: "application/pdf",
      size: BigInt(content.length),
      sha256,
    },
    create: {
      objectKey,
      originalName: `${documentId}-${locale}.pdf`,
      mimeType: "application/pdf",
      size: BigInt(content.length),
      sha256,
    },
  });
  await prisma.documentVersion.upsert({
    where: { documentId_locale_version: { documentId, locale, version: 1 } },
    update: { storedFileId: storedFile.id },
    create: { documentId, locale, version: 1, storedFileId: storedFile.id },
  });
  const scan = await prisma.antivirusScan.findFirst({
    where: { storedFileId: storedFile.id },
  });
  if (scan) {
    await prisma.antivirusScan.update({
      where: { id: scan.id },
      data: { status: "CLEAN", signature: null, scannedAt: new Date() },
    });
  } else {
    await prisma.antivirusScan.create({
      data: {
        storedFileId: storedFile.id,
        status: "CLEAN",
        scannedAt: new Date(),
      },
    });
  }
}

async function main() {
  const groupIds = {};
  for (const [name, distinguishedName] of groups) {
    const group = await prisma.directoryGroup.upsert({
      where: { name },
      update: { distinguishedName, active: true, lastSyncedAt: new Date() },
      create: {
        name,
        distinguishedName,
        active: true,
        lastSyncedAt: new Date(),
      },
    });
    groupIds[name] = group.id;
  }

  const spaceIds = {};
  for (const [slug, nameFr, nameEn, groupName] of spaces) {
    const space = await prisma.documentSpace.upsert({
      where: { slug },
      update: { nameFr, nameEn },
      create: { slug, nameFr, nameEn },
    });
    spaceIds[slug] = space.id;
    await prisma.accessRule.upsert({
      where: {
        groupId_spaceId: { groupId: groupIds[groupName], spaceId: space.id },
      },
      update: {
        showMenu: true,
        read: true,
        search: true,
        preview: true,
        download: true,
      },
      create: {
        groupId: groupIds[groupName],
        spaceId: space.id,
        showMenu: true,
        read: true,
        search: true,
        preview: true,
        download: true,
      },
    });
    for (const administratorGroup of ["ISMS-ADMINS", "ISMS-LOCAL-ADMINS"]) {
      await prisma.accessRule.upsert({
        where: {
          groupId_spaceId: {
            groupId: groupIds[administratorGroup],
            spaceId: space.id,
          },
        },
        update: {
          showMenu: true,
          read: true,
          search: true,
          preview: true,
          download: true,
          upload: true,
          edit: true,
          publish: true,
          archive: true,
        },
        create: {
          groupId: groupIds[administratorGroup],
          spaceId: space.id,
          showMenu: true,
          read: true,
          search: true,
          preview: true,
          download: true,
          upload: true,
          edit: true,
          publish: true,
          archive: true,
        },
      });
    }
  }

  const categories = {};
  for (const [slug, nameFr, nameEn] of [
    ["policies", "Politiques", "Policies"],
    ["procedures", "Procédures", "Procedures"],
    ["guides", "Guides", "Guides"],
  ]) {
    const category = await prisma.documentCategory.upsert({
      where: { spaceId_slug: { spaceId: spaceIds.general, slug } },
      update: { nameFr, nameEn },
      create: { slug, nameFr, nameEn, spaceId: spaceIds.general },
    });
    categories[slug] = category.id;
  }
  const itGuides = await prisma.documentCategory.upsert({
    where: { spaceId_slug: { spaceId: spaceIds.it, slug: "guides" } },
    update: { nameFr: "Guides", nameEn: "Guides" },
    create: {
      slug: "guides",
      nameFr: "Guides",
      nameEn: "Guides",
      spaceId: spaceIds.it,
    },
  });

  const demoDocuments = [
    [
      "policy-security",
      spaceIds.general,
      categories.policies,
      "Politique de sécurité de l’information",
      "Information security policy",
      true,
    ],
    [
      "incident-reporting",
      spaceIds.general,
      categories.procedures,
      "Procédure de signalement d’un incident",
      "Incident reporting procedure",
      true,
    ],
    [
      "vpn-guide",
      spaceIds.it,
      itGuides.id,
      "Guide d’utilisation du VPN",
      "VPN user guide",
      false,
    ],
  ];
  for (const [
    id,
    spaceId,
    categoryId,
    titleFr,
    titleEn,
    bilingual,
  ] of demoDocuments) {
    await prisma.document.upsert({
      where: { id },
      update: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        categoryId,
        spaceId,
      },
      create: {
        id,
        slug: id,
        status: "PUBLISHED",
        publishedAt: new Date(),
        categoryId,
        spaceId,
      },
    });
    await prisma.documentTranslation.upsert({
      where: { documentId_locale: { documentId: id, locale: "fr" } },
      update: { title: titleFr },
      create: { documentId: id, locale: "fr", title: titleFr },
    });
    await ensureDemoVersion(id, "fr", titleFr);
    if (bilingual) {
      await prisma.documentTranslation.upsert({
        where: { documentId_locale: { documentId: id, locale: "en" } },
        update: { title: titleEn },
        create: { documentId: id, locale: "en", title: titleEn },
      });
      await ensureDemoVersion(id, "en", titleEn);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
