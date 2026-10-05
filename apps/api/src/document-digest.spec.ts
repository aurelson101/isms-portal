import { describe, expect, it, vi } from "vitest";
import { validateSync } from "class-validator";
import { DocumentsController } from "./controllers";
import { DocumentPublicationDigestDto } from "./document-digest.dto";

const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
function setup(groups = ["ISMS-LOCAL-ADMINS"]) {
  const document = { findMany: vi.fn().mockResolvedValue(ids.map((id) => ({ id, spaceId: "space" }))) };
  const can = vi.fn().mockResolvedValue(true);
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const record = vi.fn();
  const controller = new DocumentsController({ document } as never, { can } as never, {} as never, {} as never, { record } as never, {} as never, { enqueue } as never);
  const request = { identity: { username: "moderator@example.test", groups } } as never;
  return { document, can, enqueue, record, controller, request };
}
describe("Publication digest", () => {
  it.each([[], [ids[0], ids[0]], ["invalid"], Array.from({ length: 201 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`)])("rejects an invalid document list", (documentIds) => {
    expect(validateSync(Object.assign(new DocumentPublicationDigestDto(), { documentIds })).length).toBeGreaterThan(0);
  });
  it("uses a stable queue id when the same batch is retried or reordered", async () => {
    const h = setup();
    expect(await h.controller.publicationDigest(h.request, { documentIds: ids })).toEqual({ queued: true, documents: 2 });
    await h.controller.publicationDigest(h.request, { documentIds: [...ids].reverse() });
    expect(h.enqueue.mock.calls[0][1]).toBe(h.enqueue.mock.calls[1][1]);
    expect(h.enqueue.mock.calls[0][0]).toMatchObject({ documentIds: ids, action: "document.publication.digest" });
    expect(h.can).toHaveBeenCalledWith(["ISMS-LOCAL-ADMINS"], "space", "publish");
    expect(h.record.mock.calls[0][5]).toEqual({ notify: false });
    expect(h.document.findMany.mock.calls[0][0].where).toMatchObject({ suppressEmailNotifications: true, status: "PUBLISHED", deletedAt: null });
  });
  it("does not allow ordinary readers to send a summary", async () => {
    const h = setup(["READERS"]);
    await expect(h.controller.publicationDigest(h.request, { documentIds: ids })).rejects.toThrow();
    expect(h.document.findMany).not.toHaveBeenCalled(); expect(h.enqueue).not.toHaveBeenCalled();
  });
  it("rejects a missing document or a document outside the publication scope", async () => {
    const h = setup(); h.document.findMany.mockResolvedValue([{ id: ids[0], spaceId: "space" }]);
    await expect(h.controller.publicationDigest(h.request, { documentIds: ids })).rejects.toThrow();
    expect(h.enqueue).not.toHaveBeenCalled();
  });
  it("denies a moderator without publication rights", async () => {
    const h = setup(["ISMS-MODERATOR-MANAGE"]); h.can.mockResolvedValue(false);
    await expect(h.controller.publicationDigest(h.request, { documentIds: ids })).rejects.toThrow();
    expect(h.enqueue).not.toHaveBeenCalled();
  });
  it("reports a queue failure instead of claiming a summary was sent", async () => {
    const h = setup(); h.enqueue.mockRejectedValue(new Error("Redis unavailable"));
    await expect(h.controller.publicationDigest(h.request, { documentIds: ids })).rejects.toThrow("Unable to queue");
    expect(h.record).not.toHaveBeenCalled();
  });
});
