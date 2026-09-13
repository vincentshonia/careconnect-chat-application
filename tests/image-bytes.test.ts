import { describe, expect, it } from "vitest";
import { avatarObjectPath, avatarPublicUrl, initialsOf, sniffImage } from "@/lib/image-bytes";

const pad = (head: number[]) => Uint8Array.from([...head, ...new Array(16).fill(0)]);

describe("sniffImage", () => {
  it("accepts PNG and JPEG", () => {
    expect(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      type: "image/png",
      ext: "png",
    });
    expect(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      type: "image/jpeg",
      ext: "jpg",
    });
  });

  it("rejects other formats and truncated files", () => {
    expect(sniffImage(pad([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(sniffImage(pad([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // PDF
    expect(sniffImage(Uint8Array.from([0x89, 0x50]))).toBeNull();
  });
});

describe("avatar paths", () => {
  it("reads both the stored path and the legacy proxy URL", () => {
    expect(avatarObjectPath("u1/avatar-1.png")).toBe("u1/avatar-1.png");
    expect(avatarObjectPath("/api/public/staff-avatar/u1/avatar-1.png")).toBe("u1/avatar-1.png");
    expect(avatarObjectPath(null)).toBeNull();
    expect(avatarObjectPath("../secrets")).toBeNull();
    expect(avatarObjectPath("https://evil.example/x.png")).toBeNull();
  });

  it("builds the visitor URL once, never twice", () => {
    expect(avatarPublicUrl("u1/a.png")).toBe("/api/public/staff-avatar/u1/a.png");
    expect(avatarPublicUrl("/api/public/staff-avatar/u1/a.png")).toBe(
      "/api/public/staff-avatar/u1/a.png",
    );
    expect(avatarPublicUrl(null)).toBeNull();
  });
});

describe("initialsOf", () => {
  it("takes up to two initials", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("cher")).toBe("C");
    expect(initialsOf("")).toBe("");
  });
});
