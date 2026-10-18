import { expect, it } from "vitest";
import { uploadAttempt, type UploadAttempt } from "./upload-attempt";

it("reuses the upload request ID on an unchanged retry and renews it when fields change", () => {
  const state = { current: null as UploadAttempt | null };
  const data = new FormData();
  data.set("title", "Guide");
  data.set("file", new File(["%PDF-1.7"], "guide.pdf", { type: "application/pdf", lastModified: 1 }));
  const first = uploadAttempt(data, state).get("uploadRequestId");
  expect(first).toMatch(/^[0-9a-f-]{36}$/);
  expect(uploadAttempt(data, state).get("uploadRequestId")).toBe(first);
  data.set("title", "New title");
  expect(uploadAttempt(data, state).get("uploadRequestId")).not.toBe(first);
});
