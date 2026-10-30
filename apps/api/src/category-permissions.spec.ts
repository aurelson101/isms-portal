import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { validate } from "class-validator";
import { DocumentMetadataDto } from "./admin.dto";
import { categoryAllowed, categoryDocumentWhere, resolveCategories } from "./category-permissions";

const categories = [
  { id: "public", parentId: null }, { id: "restricted", parentId: null },
  { id: "child", parentId: "restricted" }, { id: "exception", parentId: "child" },
];
describe("category permission inheritance", () => {
  it("inherits the space grant when no category has an explicit rule", () => {
    expect(resolveCategories(categories, [], true)).toEqual(categories.map(category => category.id));
    expect(resolveCategories(categories, [], false)).toEqual([]);
  });
  it("replaces the space grant for the entire restricted branch", () => {
    expect(resolveCategories(categories, [{ categoryId: "restricted", allowed: false }], true)).toEqual(["public"]);
  });
  it("grants a category and descendants without granting its space or siblings", () => {
    expect(resolveCategories(categories, [{ categoryId: "restricted", allowed: true }], false)).toEqual(["restricted", "child", "exception"]);
  });
  it("allows the nearest explicit rule to override its ancestors", () => {
    expect(resolveCategories(categories, [{ categoryId: "restricted", allowed: false }, { categoryId: "exception", allowed: true }], true)).toEqual(["public", "exception"]);
  });
  it("combines matching grants at the same scope", () => {
    expect(resolveCategories(categories, [{ categoryId: "restricted", allowed: false }, { categoryId: "restricted", allowed: true }], false)).toEqual(["restricted", "child", "exception"]);
  });
  it("denies malformed parent paths and cycles", () => {
    expect(resolveCategories([{ id: "a", parentId: "b" }, { id: "b", parentId: "a" }, { id: "missing", parentId: "unknown" }], [], true)).toEqual([]);
  });
  it("keeps uncategorized documents separate from category grants", () => {
    const scope = { id: "space", aclRoot: false, aclCategories: ["child"] };
    expect(categoryAllowed(scope, "child")).toBe(true);
    expect(categoryAllowed(scope, null)).toBe(false);
    expect(categoryAllowed(scope, "public")).toBe(false);
    expect(categoryAllowed(undefined, "child")).toBe(false);
    expect(categoryDocumentWhere([scope])).toEqual({ OR: [{ spaceId: "space", OR: [{ categoryId: { in: ["child"] } }] }] });
  });
});

describe("custom document metadata validation", () => {
  const dto = (metadata: unknown) => Object.assign(new DocumentMetadataDto(), { locale: "en", title: "Policy", metadata });
  it("accepts bounded named text fields and clearing all fields", async () => {
    expect(await validate(dto({ Reference: "POL-001", "Document owner": "Quality", Référence: "Guide" }))).toEqual([]);
    expect(await validate(dto({}))).toEqual([]);
    expect(await validate(dto({ "ged.documentType": "policy", "ged.reviewDate": "2028-02-29", "ged.owner": "Quality" }))).toEqual([]);
    expect(await validate(dto({ "ged.reviewDate": "" }))).toEqual([]);
  });
  it.each(["2027-02-29", "2028-02-30", "2028-13-01", "0000-01-01", "2028-02-29T12:00:00Z", "29/02/2028"])("rejects invalid GED review date %s", async date => {
    expect((await validate(dto({ "ged.reviewDate": date }))).length).toBeGreaterThan(0);
  });
  it("rejects unsupported GED document types while preserving arbitrary legacy fields", async () => {
    expect((await validate(dto({ "ged.documentType": "unknown" }))).length).toBeGreaterThan(0);
    expect(await validate(dto({ "Document type": "Custom type", "Review date": "Next quarter" }))).toEqual([]);
  });
  it.each([null, [], "text", { constructor: "unsafe" }, { Field: 7 }, { Field: "x".repeat(1001) }, Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`Field ${i}`, "value"]))])("rejects unsupported or excessive metadata", async metadata => {
    expect((await validate(dto(metadata))).length).toBeGreaterThan(0);
  });
});
