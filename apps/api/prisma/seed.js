const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const groups = [
  ['Domain Users', 'CN=Domain Users,DC=demo,DC=local'],
  ['ITAD', 'CN=ITAD,DC=demo,DC=local'],
  ['HRAD', 'CN=HRAD,DC=demo,DC=local'],
  ['FINANCEAD', 'CN=FINANCEAD,DC=demo,DC=local'],
  ['MANAGEMENTAD', 'CN=MANAGEMENTAD,DC=demo,DC=local'],
  ['ISMS-ADMINS', 'CN=ISMS-ADMINS,DC=demo,DC=local'],
];

const spaces = [
  ['general', 'Documents généraux', 'General documents', 'Domain Users'],
  ['it', 'IT', 'IT', 'ITAD'],
  ['hr', 'Ressources humaines', 'Human resources', 'HRAD'],
  ['finance', 'Finance', 'Finance', 'FINANCEAD'],
  ['management', 'Direction', 'Management', 'MANAGEMENTAD'],
];

async function main() {
  const groupIds = {};
  for (const [name, distinguishedName] of groups) {
    const group = await prisma.directoryGroup.upsert({
      where: { name },
      update: { distinguishedName, active: true, lastSyncedAt: new Date() },
      create: { name, distinguishedName, active: true, lastSyncedAt: new Date() },
    });
    groupIds[name] = group.id;
  }

  const spaceIds = {};
  for (const [slug, nameFr, nameEn, groupName] of spaces) {
    const space = await prisma.documentSpace.upsert({
      where: { slug }, update: { nameFr, nameEn }, create: { slug, nameFr, nameEn },
    });
    spaceIds[slug] = space.id;
    await prisma.accessRule.upsert({
      where: { groupId_spaceId: { groupId: groupIds[groupName], spaceId: space.id } },
      update: { showMenu: true, read: true, search: true, preview: true, download: true },
      create: { groupId: groupIds[groupName], spaceId: space.id,
        showMenu: true, read: true, search: true, preview: true, download: true },
    });
    await prisma.accessRule.upsert({
      where: { groupId_spaceId: { groupId: groupIds['ISMS-ADMINS'], spaceId: space.id } },
      update: { showMenu: true, read: true, search: true, preview: true, download: true,
        upload: true, edit: true, publish: true, archive: true, administer: true },
      create: { groupId: groupIds['ISMS-ADMINS'], spaceId: space.id, showMenu: true, read: true,
        search: true, preview: true, download: true, upload: true, edit: true,
        publish: true, archive: true, administer: true },
    });
  }

  const categories = {};
  for (const [slug, nameFr, nameEn] of [
    ['policies', 'Politiques', 'Policies'],
    ['procedures', 'Procédures', 'Procedures'],
    ['guides', 'Guides', 'Guides'],
  ]) {
    const category = await prisma.documentCategory.upsert({
      where: { spaceId_slug: { spaceId: spaceIds.general, slug } },
      update: { nameFr, nameEn },
      create: { slug, nameFr, nameEn, spaceId: spaceIds.general },
    });
    categories[slug] = category.id;
  }
  const itGuides = await prisma.documentCategory.upsert({
    where: { spaceId_slug: { spaceId: spaceIds.it, slug: 'guides' } },
    update: { nameFr: 'Guides', nameEn: 'Guides' },
    create: { slug: 'guides', nameFr: 'Guides', nameEn: 'Guides', spaceId: spaceIds.it },
  });

  const demoDocuments = [
    ['policy-security', spaceIds.general, categories.policies,
      "Politique de sécurité de l’information", 'Information security policy', true],
    ['incident-reporting', spaceIds.general, categories.procedures,
      "Procédure de signalement d’un incident", 'Incident reporting procedure', true],
    ['vpn-guide', spaceIds.it, itGuides.id, "Guide d’utilisation du VPN", 'VPN user guide', false],
  ];
  for (const [id, spaceId, categoryId, titleFr, titleEn, bilingual] of demoDocuments) {
    await prisma.document.upsert({
      where: { id },
      update: { status: 'PUBLISHED', publishedAt: new Date(), categoryId, spaceId },
      create: { id, status: 'PUBLISHED', publishedAt: new Date(), categoryId, spaceId },
    });
    await prisma.documentTranslation.upsert({
      where: { documentId_locale: { documentId: id, locale: 'fr' } },
      update: { title: titleFr }, create: { documentId: id, locale: 'fr', title: titleFr },
    });
    if (bilingual) {
      await prisma.documentTranslation.upsert({
        where: { documentId_locale: { documentId: id, locale: 'en' } },
        update: { title: titleEn }, create: { documentId: id, locale: 'en', title: titleEn },
      });
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

