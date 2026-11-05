"use client";

import { useCallback, useEffect, useState } from "react";
import { prepareBrandLogo } from "./branding";
import { fetchWithTimeout as fetch } from "./http-client";

export type PortalArticle = {
  id: string;
  title: string;
  url: string;
  imageDataUrl: string | null;
};

const safeUrl = (value: string) => /^https?:\/\//iu.test(value);
const safeImage = (value: string | null) =>
  value && /^data:image\/(png|jpeg|webp);base64,/iu.test(value) ? value : null;

const loadArticles = async (): Promise<PortalArticle[]> => {
  const response = await fetch("/api/articles", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as PortalArticle[];
  return Array.isArray(data) ? data.filter((item) => safeUrl(item.url)) : [];
};

export function ArticleCard({ article }: { article: PortalArticle }) {
  const image = safeImage(article.imageDataUrl);
  return (
    <a
      className="article-card"
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {image && <img src={image} alt="" loading="lazy" />}
      <strong>{article.title}</strong>
    </a>
  );
}

export function ArticlesSection({ label }: { label: string }) {
  const [articles, setArticles] = useState<PortalArticle[]>([]);
  useEffect(() => {
    void loadArticles()
      .then(setArticles)
      .catch(() => setArticles([]));
  }, []);
  if (articles.length === 0) return null;
  return (
    <section className="articles-grid" aria-label={label}>
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </section>
  );
}

export function ArticlesAdmin({
  onError,
  onNotice,
}: {
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [articles, setArticles] = useState<PortalArticle[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(
    () =>
      loadArticles()
        .then(setArticles)
        .catch((error: Error) => onError(error.message)),
    [onError],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const request = async (path: string, init: RequestInit) => {
    const response = await fetch(path, init);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      throw new Error(
        [body?.message].flat().join(" ") || `HTTP ${response.status}`,
      );
    }
  };

  return (
    <section className="admin-card profile-settings">
      <h2>Articles</h2>
      <p>
        Les articles s’affichent sur la page d’accueil ; un clic ouvre le lien
        dans un nouvel onglet. La photo est optionnelle.
      </p>
      <form
        className="admin-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await request("/api/articles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, url, imageDataUrl: image }),
            });
            setTitle("");
            setUrl("");
            setImage(null);
            event.currentTarget.reset();
            await reload();
            onNotice("Article ajouté.");
          } catch (error) {
            onError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Titre
          <input
            required
            minLength={3}
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Lien (https://…)
          <input
            required
            type="url"
            maxLength={2000}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label>
          Photo (optionnelle)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return setImage(null);
              try {
                setImage(await prepareBrandLogo(file));
              } catch {
                setImage(null);
                onError("Image PNG, JPEG ou WebP valide requise.");
              }
            }}
          />
        </label>
        <div className="button-row">
          <button className="primary" disabled={busy}>
            Ajouter l’article
          </button>
        </div>
      </form>
      <ul>
        {articles.map((article) => (
          <li key={article.id}>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              {article.title}
            </a>{" "}
            <button
              type="button"
              onClick={async () => {
                try {
                  await request(
                    `/api/articles/${encodeURIComponent(article.id)}`,
                    { method: "DELETE" },
                  );
                  await reload();
                  onNotice("Article supprimé.");
                } catch (error) {
                  onError((error as Error).message);
                }
              }}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
