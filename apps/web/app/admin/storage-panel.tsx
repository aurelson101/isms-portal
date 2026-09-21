"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "../icons";

type Target = {
  id: string; name: string; type: "s3" | "smb"; enabled: boolean;
  testStatus: "untested" | "success" | "failure"; testedAt: string | null;
  endpoint?: string; bucket?: string; prefix?: string; region?: string; mount?: string; forcePathStyle?: boolean;
};

async function request<T>(path = "", body?: Record<string, unknown>, method = "POST"): Promise<T> {
  const response = await fetch(`/api/admin/storage-targets${path}`, body === undefined ? { cache: "no-store" } : {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.message === "string" ? error.message : `HTTP ${response.status}`);
  }
  return response.json();
}

export function StoragePanel({ locale }: { locale: "fr" | "en" }) {
  const t = (fr: string, en: string) => locale === "fr" ? fr : en;
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Target | null>(null);
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<"s3" | "smb">("s3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const data = await request<Target[]>();
    setTargets(data);
    setSelected((current) => current ? data.find((target) => target.id === current.id) || null : null);
  }, []);
  useEffect(() => { refresh().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)); }, [refresh]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("Échec de l'opération", "Operation failed")); }
    finally { setBusy(false); }
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    void run(async () => {
      const body: Record<string, unknown> = { name: data.name };
      if (data.accessKeyId || data.secretAccessKey) { body.accessKeyId = data.accessKeyId; body.secretAccessKey = data.secretAccessKey; }
      if (creating) Object.assign(body, { type, endpoint: data.endpoint, region: data.region, bucket: data.bucket, prefix: data.prefix, mount: data.mount, forcePathStyle: data.forcePathStyle === "on" });
      const result = await request<Target>(creating ? "" : `/${selected!.id}`, body, creating ? "POST" : "PUT");
      setSelected(result); setCreating(false);
      setNotice(t("Configuration enregistrée.", "Configuration saved."));
    });
  };
  const status = (target: Target) => target.testStatus === "failure" ? t("Test échoué", "Test failed") : target.enabled ? t("Actif", "Active") : target.testStatus === "success" ? t("Test réussi · Inactif", "Test passed · Inactive") : t("À tester", "Not tested");
  const currentType = creating ? type : selected?.type;

  return <section className="storage-panel" aria-busy={busy || loading}>
    <div className="storage-heading">
      <h1>{t("Stockage des documents", "Document storage")}</h1>
      <button type="button" className="primary" disabled={busy || loading} onClick={() => { setCreating(true); setSelected(null); setError(""); setNotice(""); }}><Icon name="add" />{t("Ajouter un stockage", "Add storage")}</button>
    </div>
    {error && <p className="error-state" role="alert">{error}</p>}
    {notice && <p className="storage-notice" role="status">{notice}</p>}
    <div className="storage-layout">
      <div className="storage-list">
        <div className="storage-primary"><Icon name="folder" /><strong>{t("Stockage principal", "Primary storage")}</strong><span className="storage-status">{t("Par défaut", "Default")}</span></div>
        {loading && <p role="status">{t("Chargement…", "Loading…")}</p>}
        {!loading && !targets.length && <p className="muted">{t("Aucun stockage optionnel configuré.", "No optional storage configured.")}</p>}
        {targets.map((target) => <div className="storage-row" key={target.id}>
          <button type="button" className="storage-target" aria-pressed={selected?.id === target.id} disabled={busy} onClick={() => { setSelected(target); setCreating(false); setError(""); setNotice(""); }}>
            <strong>{target.name}</strong><span>{target.type.toUpperCase()}</span>
            <span className={`storage-status ${target.testStatus === "failure" ? "failed" : ""}`}>{status(target)}</span>
          </button>
          <label className="storage-toggle"><input type="checkbox" aria-label={`${t("Activer", "Enable")} ${target.name}`} checked={target.enabled} disabled={busy || target.testStatus !== "success"} onChange={(event) => { const enabled = event.target.checked; void run(async () => { await request(`/${target.id}`, { enabled }, "PUT"); }); }} />{t("Proposer au dépôt", "Available for uploads")}</label>
        </div>)}
      </div>
      {(creating || selected) && <section className="storage-editor" aria-labelledby="storage-editor-title">
        <div className="storage-heading"><h2 id="storage-editor-title">{creating ? t("Nouveau stockage", "New storage") : selected!.name}</h2><button type="button" className="storage-icon" title={t("Fermer", "Close")} aria-label={t("Fermer", "Close")} disabled={busy} onClick={() => { setSelected(null); setCreating(false); }}><Icon name="close" /></button></div>
        <form key={creating ? "new" : `${selected!.id}-${selected!.testedAt}-${notice}`} onSubmit={save}>
          <fieldset disabled={busy} className="storage-fields">
            <label>{t("Nom", "Name")}<input name="name" required maxLength={80} defaultValue={selected?.name || ""} /></label>
            {creating && <label>{t("Type de stockage", "Storage type")}<select value={type} onChange={(event) => setType(event.target.value as "s3" | "smb")}><option value="s3">S3 compatible</option><option value="smb">SMB / CIFS</option></select></label>}
            {currentType === "s3" && <>
              <label>{t("Adresse S3 (HTTPS)", "S3 endpoint (HTTPS)")}<input name="endpoint" type="url" required defaultValue={selected?.endpoint} readOnly={!creating} placeholder="https://s3.example.com" /></label>
              <div className="storage-field-pair"><label>{t("Région", "Region")}<input name="region" required defaultValue={selected?.region || "us-east-1"} readOnly={!creating} /></label><label>Bucket<input name="bucket" required maxLength={63} defaultValue={selected?.bucket} readOnly={!creating} /></label></div>
              <label>{t("Préfixe (facultatif)", "Prefix (optional)")}<input name="prefix" defaultValue={selected?.prefix} readOnly={!creating} placeholder="isms" /></label>
              <label className="storage-toggle"><input name="forcePathStyle" type="checkbox" defaultChecked={selected?.forcePathStyle ?? true} disabled={!creating} />Path-style</label>
              <label>{t(creating ? "Clé d'accès" : "Nouvelle clé d'accès (facultatif)", creating ? "Access key ID" : "New access key ID (optional)")}<input name="accessKeyId" autoComplete="off" required={creating} /></label>
              <label>{t(creating ? "Clé secrète" : "Nouvelle clé secrète (facultatif)", creating ? "Secret access key" : "New secret access key (optional)")}<input name="secretAccessKey" type="password" autoComplete="new-password" required={creating} /></label>
            </>}
            {currentType === "smb" && <label>{t("Partage monté sous /data/smb", "Mounted share under /data/smb")}<input name="mount" required defaultValue={selected?.mount} readOnly={!creating} placeholder="documents" /></label>}
            <div className="storage-actions"><button type="submit" className="primary"><Icon name="check" />{busy ? t("En cours…", "Working…") : t("Enregistrer", "Save")}</button>
              {!creating && selected && <button type="button" onClick={() => { void run(async () => {
                const result = await request<{ success: boolean }>(`/${selected.id}/test`, {});
                if (result.success) setNotice(t("Test réussi : écriture, lecture et suppression.", "Test passed: write, read and delete."));
                else setError(t("Test échoué. Vérifiez la destination, les droits et la connexion réseau.", "Test failed. Check the destination, permissions and network connection."));
              }); }}><Icon name="sync" />{t("Tester la connexion", "Test connection")}</button>}
            </div>
          </fieldset>
        </form>
        {selected?.testedAt && <p className="muted">{t("Dernier test : ", "Last test: ")}{new Date(selected.testedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")}</p>}
      </section>}
    </div>
  </section>;
}
