import { expect, it } from "vitest";
import { uploadAttempt, type UploadAttempt } from "./upload-attempt";

it("reuses the upload request ID on an unchanged retry and renews it when fields change", () => {
  const state = { current: null as UploadAttempt | null };
  const data = new FormData();
  data.set("title", "Guide");
  data.set(
    "file",
    new File(["%PDF-1.7"], "guide.pdf", {
      type: "application/pdf",
      lastModified: 1,
    }),
  );
  const first = uploadAttempt(data, state).get("uploadRequestId");
  expect(first).toMatch(/^[0-9a-f-]{36}$/);
  expect(uploadAttempt(data, state).get("uploadRequestId")).toBe(first);
  data.set("title", "New title");
  expect(uploadAttempt(data, state).get("uploadRequestId")).not.toBe(first);
});

it("distinguishes different files with identical names and metadata", () => {
  const state = { current: null as UploadAttempt | null };
  const data = new FormData();
  const options = { type: "application/pdf", lastModified: 1 };
  data.set("file", new File(["A"], "guide.pdf", options));
  const original = uploadAttempt(data, state).get("uploadRequestId");
  data.set("file", new File(["B"], "guide.pdf", options));
  expect(uploadAttempt(data, state).get("uploadRequestId")).not.toBe(original);
});

it("reuses the ID when a form is reconstructed with the same file in another field order", () => {
  const state = { current: null as UploadAttempt | null };
  const file = new File(["A"], "guide.pdf");
  const first = new FormData();
  first.set("title", "Guide");
  first.set("file", file);
  const original = uploadAttempt(first, state).get("uploadRequestId");
  const second = new FormData();
  second.set("file", file);
  second.set("title", "Guide");
  expect(uploadAttempt(second, state).get("uploadRequestId")).toBe(original);
});

it("preserves the meaningful ordering of repeated fields", () => {
  const state = { current: null as UploadAttempt | null };
  const first = new FormData();
  first.append("tag", "A");
  first.append("tag", "B");
  const original = uploadAttempt(first, state).get("uploadRequestId");
  const second = new FormData();
  second.append("tag", "B");
  second.append("tag", "A");
  expect(uploadAttempt(second, state).get("uploadRequestId")).not.toBe(
    original,
  );
});

it("ignores supplied IDs and removes duplicate request ID fields", () => {
  const state = { current: null as UploadAttempt | null };
  const data = new FormData();
  data.set("title", "Guide");
  const original = uploadAttempt(data, state).get("uploadRequestId");
  data.append("uploadRequestId", "untrusted");
  expect(uploadAttempt(data, state).getAll("uploadRequestId")).toEqual([
    original,
  ]);
});
