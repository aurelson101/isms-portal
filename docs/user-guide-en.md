# User guide

## Sign in and choose a language

Use Continue with Microsoft when SSO is configured, or the available Active
Directory sign-in. Access follows your account and authorised groups. Use search
or browse categories. Only authorised spaces and documents
are visible. FR/EN/ES/SK availability follows the portal language policy. Choose
a default language in your profile; browser detection applies when no preference
is saved.

## Search and read

PDF files open in the integrated viewer. Word DOCX and Excel XLSX files use a
local read-only view. Administrators may disable download independently from
preview permission.

The explorer shows 20 documents per page with Previous/Next. Targeted GED search
covers reference, owner, type, keywords and review dates, combines with favorites
and can be saved. Business metadata remains optional. Administrators and
moderators share List/Windows management views and metadata tools without
creating file versions for metadata-only changes.

Favorites belong to the signed-in account. Adding or removing one refreshes the
list and counts. Saving a search retains criteria without changing permissions.
Record keywords can link to related searches.

In Excel, choose a worksheet, search text and use available filters. Viewing never
modifies the stored workbook. For an embedded SharePoint video, use its player
controls; source Microsoft permissions remain necessary. SSO alone does not
decrypt protected files.

## Manage documents within your permissions

In administration or moderation, **Status** locates drafts, published content
and archives according to the menu options. Combine it with search; changing the
filter returns to the first page without changing any document state.

**Edit metadata** changes the title, description, language, category and optional
fields without creating a version. **New version** replaces the file and records
a change summary. Document language is separate from interface language. When
available, the text comparison shows Before/After changes from the previous version.

Publication asks you to check the summary and notification choice. Reviews and
reminders are configured separately in governance. A metadata review date does
not automatically schedule a review.

## Sensitive documents

A sensitive document can only be created by a user designated by an
administrator. That user can share it with named people for a chosen period or
for life: open the published document, expand **Share this sensitive
document**, enter the recipient (directory suggestions) and the duration. For an
AD group, preview recipients before confirming: preview creates no share and
sends no email. If a sensitive document is shared with you, find it under
**Sensitive documents shared with me** on the home page. Access is personal,
read-only and without download for shared files; watermarking depends on the
supported format. Access ends at expiry or revocation. For a link, ISMS controls
access to the record; remote content permissions and protection belong to the
source service.

Notifications follow configured channels and recipients. If email is missing,
an administrator can inspect delivery history in Observability. Accepted means
the provider took charge of the message, not confirmed inbox receipt. Ordinary
space permissions do not replace a named or authorised group share.

See [Document management](document-management.md) and
[anonymized screenshots](screenshots/README.md).
