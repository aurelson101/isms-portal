import "./styles.css";
export const metadata = {
  title: "ISMS Portal",
  description: "Information Security Management System portal",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
