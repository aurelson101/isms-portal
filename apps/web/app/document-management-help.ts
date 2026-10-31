import type { Locale } from "./i18n/locale";
const paragraphs = {
  fr: [
    "Recherche GED : combinez référence, responsable, type, mots-clés et dates de revue avec les filtres de langue et les favoris. Les champs ciblés respectent la casse. Enregistrez la recherche pour retrouver ces critères.",
    "Modifier un lot : sélectionnez les documents de la page courante, choisissez éventuellement une catégorie et ajoutez uniquement les champs à remplacer (par exemple ged.owner = Alice). Prévisualisez les valeurs avant/après, puis confirmez. Les autres champs sont conservés et aucune nouvelle version du fichier n'est créée. Tout le lot est refusé si un droit manque ou si un document a changé. Aucune métadonnée n'est obligatoire.",
    "Historique des modifications : ouvrez l'éditeur d'une fiche, puis l'historique pour consulter l'auteur, la date et les noms des champs modifiés. Les anciennes valeurs ne sont pas exposées. Cet historique est réservé aux éditeurs et séparé des versions du fichier.",
    "Un fichier identique est détecté par SHA-256 uniquement parmi les documents que vous pouvez modifier. Ouvrez l'existant ou gérez sa nouvelle version au lieu de créer un doublon. Un document hors de vos droits ne sera pas révélé.",
    "Suivi documentaire : les compteurs concernent vos documents modifiables. Les champs conseillés sont facultatifs. Les administrateurs peuvent activer les rappels, régler le préavis et le délai de retard des revues annuelles et répéter les rappels de publication (0 = une seule fois). Les canaux documentaires existants sont utilisés ; la date ged.reviewDate ne crée pas de revue.",
  ],
  en: [
    "GED search: combine reference, owner, document type, keywords and review dates with language filters and favorites. Targeted fields are case-sensitive. Save the search to reuse these criteria.",
    "Bulk editing: select documents on the current page, optionally choose a category and add only fields to replace (for example ged.owner = Alice). Preview before/after values, then confirm. Other fields are preserved and no file version is created. The entire batch is rejected if permission is missing or a document changed. No metadata field is mandatory.",
    "Change history: open a document editor, then the history to see actor, time and changed field names. Previous values are not exposed. History is restricted to editors and separate from file versions.",
    "An identical file is detected using SHA-256 only among documents you can edit. Open the existing document or manage its new version instead of creating a duplicate. Documents outside your permissions are not revealed.",
    "Document follow-up: counts cover documents you can edit. Recommended fields remain optional. Administrators can enable reminders, set annual-review lead and overdue delays and repeat publication reminders (0 = once). Existing document delivery channels are used; ged.reviewDate does not create a review.",
  ],
  es: [
    "Búsqueda documental: combine referencia, responsable, tipo, palabras clave y fechas de revisión con los filtros de idioma y favoritos. Los campos específicos distinguen mayúsculas y minúsculas. Guarde la búsqueda para reutilizar los criterios.",
    "Edición en lote: seleccione documentos de la página actual, elija opcionalmente una categoría y añada solo los campos que desea reemplazar (por ejemplo ged.owner = Alice). Revise los valores antes/después y confirme. Se conservan los otros campos y no se crea una versión del archivo. El lote completo se rechaza si faltan permisos o cambia un documento. Ningún metadato es obligatorio.",
    "Historial de cambios: abra el editor y el historial para ver autor, fecha y nombres de campos modificados. No se muestran valores anteriores. Solo los editores pueden acceder y el historial es independiente de las versiones del archivo.",
    "Los archivos idénticos se detectan por SHA-256 solo entre los documentos que puede editar. Abra el documento existente o gestione su nueva versión. No se revelan documentos fuera de sus permisos.",
    "Seguimiento documental: los contadores incluyen los documentos editables. Los campos recomendados son opcionales. Los administradores pueden activar recordatorios, configurar los plazos de revisión anual y repetir los recordatorios de publicación (0 = una vez). Se utilizan los canales existentes; ged.reviewDate no crea una revisión.",
  ],
  sk: [
    "Vyhľadávanie dokumentov: kombinujte referenciu, vlastníka, typ, kľúčové slová a dátumy kontroly s jazykom a obľúbenými dokumentmi. Konkrétne polia rozlišujú veľké a malé písmená. Uložte vyhľadávanie na opakované použitie.",
    "Hromadná úprava: vyberte dokumenty na aktuálnej stránke, prípadne zvoľte kategóriu a pridajte iba polia na nahradenie (napríklad ged.owner = Alice). Skontrolujte hodnoty pred a po zmene a potvrďte. Ostatné polia zostanú zachované a nevytvorí sa verzia súboru. Celá dávka sa odmietne pri chýbajúcom oprávnení alebo zmene dokumentu. Žiadne metadáta nie sú povinné.",
    "História zmien: otvorte editor dokumentu a históriu, kde nájdete autora, čas a názvy zmenených polí. Predchádzajúce hodnoty sa nezobrazujú. História je dostupná iba editorom a je oddelená od verzií súboru.",
    "Rovnaké súbory sa rozpoznajú pomocou SHA-256 iba medzi dokumentmi, ktoré môžete upravovať. Otvorte existujúci dokument alebo spravujte jeho novú verziu. Dokumenty mimo vašich oprávnení sa nezobrazia.",
    "Sledovanie dokumentov: počty zahŕňajú upraviteľné dokumenty. Odporúčané polia sú voliteľné. Správcovia môžu povoliť pripomienky, nastaviť lehoty ročných kontrol a opakovanie pripomienok publikácie (0 = raz). Použijú sa existujúce kanály; ged.reviewDate nevytvára kontrolu.",
  ],
};
const viewHelp = {
  fr: "Documents et Métadonnées : choisissez Liste ou Fenêtres. Les deux vues affichent 20 documents par page avec Précédent/Suivant ; les filtres sont conservés et le choix de présentation est mémorisé dans le navigateur pour l'administration et la modération.",
  en: "Documents and Metadata: choose List or Windows. Both views show 20 documents per page with Previous/Next, preserve filters and remember the presentation in the browser for administration and moderation.",
  es: "Documentos y Metadatos: elija Lista o Ventanas. Ambas vistas muestran 20 documentos por página con Anterior/Siguiente, conservan los filtros y recuerdan la presentación en el navegador para administración y moderación.",
  sk: "Dokumenty a Metadáta: vyberte Zoznam alebo Okná. Oba pohľady zobrazujú 20 dokumentov na stránku s tlačidlami Späť/Ďalej, zachovávajú filtre a pamätajú si zobrazenie v prehliadači pre správu aj moderovanie.",
};
export const documentManagementHelp = (locale: Locale) => [
  viewHelp[locale],
  ...paragraphs[locale],
];
