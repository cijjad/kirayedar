import { describe, expect, it } from "vitest";
import { checkDeclaredFile, contentMatchesDeclared, sniffMime } from "@/lib/security/files";
import { canonicalJson, contentHash, newPublicCode } from "./hash";
import { contactSchema, normalizePkPhone, step3 } from "./schema";

describe("hashing", () => {
  it("is independent of key order", () => {
    expect(contentHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(contentHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it("public codes have the documented shape", () => {
    expect(newPublicCode(new Date("2026-11-26T00:00:00Z"))).toMatch(/^IB-2611-[2-9A-HJKMNP-Z]{6}$/);
  });
});

describe("Pakistani phone numbers", () => {
  it.each([["0300 1234567"], ["+92 300 1234567"], ["923001234567"], ["0300-1234567"]])("accepts %s", (p) => {
    expect(normalizePkPhone(p)).toBe("+923001234567");
  });
  it.each([["042 1234567"], ["+1 415 555 1234"], ["0300 123"]])("rejects %s", (p) => {
    expect(normalizePkPhone(p)).toBeNull();
  });
});

describe("wizard validation", () => {
  it("requires competitors or the 'no one I know' checkbox", () => {
    const base = { differentiation: "x".repeat(20), whyBetter: "x".repeat(20), disruption: "x".repeat(20) };
    expect(step3.safeParse({ ...base, competitors: [], noCompetitorsKnown: false }).success).toBe(false);
    expect(step3.safeParse({ ...base, competitors: [], noCompetitorsKnown: true }).success).toBe(true);
  });
  it("requires both consents", () => {
    const c = { name: "Ali Raza", city: "lahore", phone: "03001234567", email: "a@b.pk", consentTerms: true, consentBlind: false };
    expect(contactSchema.safeParse(c).success).toBe(false);
    expect(contactSchema.safeParse({ ...c, consentBlind: true }).success).toBe(true);
  });
});

describe("file checks", () => {
  it("accepts allowed type with matching extension and size", () => {
    expect(checkDeclaredFile("deck.pdf", "application/pdf", 1000)).toMatchObject({ ok: true });
  });
  it("rejects wrong extension, wrong type, and oversize", () => {
    expect(checkDeclaredFile("deck.exe", "application/pdf", 1000)).toMatchObject({ ok: false });
    expect(checkDeclaredFile("x.html", "text/html", 10)).toMatchObject({ ok: false });
    expect(checkDeclaredFile("big.mp4", "video/mp4", 26 * 1024 * 1024)).toMatchObject({ ok: false, error: "file_too_large" });
  });
  it("detects real content type from magic bytes", () => {
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("rejects an HTML file renamed to .pdf", () => {
    expect(contentMatchesDeclared("application/pdf", new TextEncoder().encode("<html><script>"))).toBe(false);
  });
});
