export type UploadAttempt = { signature: string; id: string };

const fileIdentities = new WeakMap<File, string>();

function fileIdentity(file: File) {
  let id = fileIdentities.get(file);
  if (!id) { id = crypto.randomUUID(); fileIdentities.set(file, id); }
  return id;
}

export function uploadAttempt(data: FormData, state: { current: UploadAttempt | null }) {
  const fields = Array.from(data.entries()).filter(([key]) => key !== "uploadRequestId").map(([key, value]) => [key,
    typeof value === "string" ? value : [value.name, value.size, value.type, value.lastModified, fileIdentity(value)],
  ] as const);
  const signature = JSON.stringify(fields.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  if (state.current?.signature !== signature) state.current = { signature, id: crypto.randomUUID() };
  data.set("uploadRequestId", state.current.id);
  return data;
}
