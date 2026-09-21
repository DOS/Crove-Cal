import { MembershipRole } from "@calcom/prisma/enums";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getBootstrapAdminRole } from "./syncDosOrganizations";

describe("getBootstrapAdminRole", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when ADMIN_EMAILS is not configured", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(getBootstrapAdminRole("admin@dos.me")).toBeNull();
    expect(getBootstrapAdminRole(null)).toBeNull();
  });

  it("grants ADMIN to a configured email (case-insensitive, trimmed)", () => {
    vi.stubEnv("ADMIN_EMAILS", " Joy@DOS.me , someone@example.com ");
    expect(getBootstrapAdminRole("joy@dos.me")).toBe(MembershipRole.ADMIN);
    expect(getBootstrapAdminRole("  Joy@DOS.me  ")).toBe(MembershipRole.ADMIN);
    expect(getBootstrapAdminRole("someone@example.com")).toBe(MembershipRole.ADMIN);
  });

  it("returns null for emails outside the list", () => {
    vi.stubEnv("ADMIN_EMAILS", "joy@dos.me");
    expect(getBootstrapAdminRole("stranger@example.com")).toBeNull();
  });

  it("never grants OWNER - the bootstrap hatch caps at ADMIN", () => {
    vi.stubEnv("ADMIN_EMAILS", "joy@dos.me");
    const role = getBootstrapAdminRole("joy@dos.me");
    expect(role).toBe(MembershipRole.ADMIN);
    expect(role).not.toBe(MembershipRole.OWNER);
  });
});
