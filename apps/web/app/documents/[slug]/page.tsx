import { Portal } from "../../page";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <Portal explorerMode initialDocumentSlug={slug} />;
}
