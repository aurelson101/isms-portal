export type UploadAttempt = { signature: string; id: string };

export function uploadAttempt(data: FormData, state: { current: UploadAttempt | null }) {
  const fields = Array.from(data.entries()).filter(([key]) => key !== "uploadRequestId").map(([key, value]) => [key,
    typeof value === "string" ? value : [value.name, value.size, value.type, value.lastModified],
  ]);
  const signature = JSON.stringify(fields);
  if (state.current?.signature !== signature) state.current = { signature, id: crypto.randomUUID() };
  data.set("uploadRequestId", state.current.id);
  return data;
}
