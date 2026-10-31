import "./styles.css";
import "./admin/storage.css";
import "./document-layout.css";
import { VersionFooter } from "./version-footer";
import { DuplicateUploadNotice } from "./duplicate-upload-notice";
export const metadata = {
  title: "ISMS Portal",
  description: "Information Security Management System portal",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        {children}
        <VersionFooter />
        <DuplicateUploadNotice />
      </body>
    </html>
  );
}
