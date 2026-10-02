import { MembershipRole } from "@calcom/prisma/enums";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBootstrapAdminRole,
  isBreakGlassLoginAllowed,
  isBreakGlassLoginConfigured,
} from "./syncDosOrganizations";

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

describe("isBreakGlassLoginAllowed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows everyone when ADMIN_EMAILS is unset (legacy deployments)", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isBreakGlassLoginAllowed("anyone@example.com")).toBe(true);
    expect(isBreakGlassLoginAllowed(null)).toBe(true);
  });

  it("restricts to the allowlist when configured", () => {
    vi.stubEnv("ADMIN_EMAILS", "Joy@DOS.me, joy@crove.com");
    expect(isBreakGlassLoginAllowed("joy@dos.me")).toBe(true);
    expect(isBreakGlassLoginAllowed("  JOY@CROVE.COM ")).toBe(true);
    expect(isBreakGlassLoginAllowed("stranger@example.com")).toBe(false);
  });

  it("rejects a missing email when the allowlist is active", () => {
    vi.stubEnv("ADMIN_EMAILS", "joy@dos.me");
    expect(isBreakGlassLoginAllowed(null)).toBe(false);
  });

  it("honors the suite-standard AUTH_BREAK_GLASS_EMAILS variable", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubEnv("AUTH_BREAK_GLASS_EMAILS", "admin@dos.me");
    expect(isBreakGlassLoginAllowed("admin@dos.me")).toBe(true);
    expect(isBreakGlassLoginAllowed("other@example.com")).toBe(false);
    expect(isBreakGlassLoginConfigured()).toBe(true);
    expect(getBootstrapAdminRole("admin@dos.me")).toBe(MembershipRole.ADMIN);
  });

  it("unions AUTH_BREAK_GLASS_EMAILS with the legacy ADMIN_EMAILS", () => {
    vi.stubEnv("AUTH_BREAK_GLASS_EMAILS", "new@dos.me");
    vi.stubEnv("ADMIN_EMAILS", "legacy@dos.me");
    expect(isBreakGlassLoginAllowed("new@dos.me")).toBe(true);
    expect(isBreakGlassLoginAllowed("legacy@dos.me")).toBe(true);
  });

  it("reports unconfigured when neither variable is set", () => {
    vi.stubEnv("AUTH_BREAK_GLASS_EMAILS", "");
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isBreakGlassLoginConfigured()).toBe(false);
  });
});
