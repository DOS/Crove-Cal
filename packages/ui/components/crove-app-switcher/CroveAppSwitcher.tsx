"use client";

import classNames from "@calcom/ui/classNames";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Grid3x3Icon } from "@coss/ui/icons";
import type { ComponentProps } from "react";
import { forwardRef } from "react";

export interface CroveAppItem {
  id: string;
  name: string;
  category: "crove" | "dos";
  description: string;
  url: string;
  iconBg: string;
  iconColor: string;
  badge?: string;
  isCurrent?: boolean;
}

export const CROVE_ECOSYSTEM_APPS: CroveAppItem[] = [
  // Crove Suite
  {
    id: "cal",
    name: "Crove Cal",
    category: "crove",
    description: "Scheduling & Meetings",
    url: "https://cal.crove.com",
    iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    iconColor: "text-blue-600 dark:text-blue-400",
    isCurrent: true,
  },
  {
    id: "crm",
    name: "Crove CRM",
    category: "crove",
    description: "Sales & Customer CRM",
    url: "https://crm.crove.com",
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "post",
    name: "Crove Post",
    category: "crove",
    description: "Social Media & Content",
    url: "https://post.crove.com",
    iconBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  {
    id: "sign",
    name: "Crove Sign",
    category: "crove",
    description: "E-Signatures & Contracts",
    url: "https://sign.crove.com",
    iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "desk",
    name: "Crove Desk",
    category: "crove",
    description: "Helpdesk & AI Support",
    url: "https://desk.crove.com",
    iconBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    iconColor: "text-rose-600 dark:text-rose-400",
  },
  // DOS Ecosystem
  {
    id: "dos-id",
    name: "DOS ID",
    category: "dos",
    description: "Central SSO & Identity",
    url: "https://id.dos.me",
    iconBg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    iconColor: "text-cyan-600 dark:text-cyan-400",
  },
  {
    id: "dos-me",
    name: "DOS.Me",
    category: "dos",
    description: "Organizations & Workspace",
    url: "https://dos.me",
    iconBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    iconColor: "text-indigo-600 dark:text-indigo-400",
  },
  {
    id: "dos-ai",
    name: "DOS AI",
    category: "dos",
    description: "Enterprise AI Agents",
    url: "https://ai.dos.me",
    iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  {
    id: "dosafe",
    name: "DOSafe",
    category: "dos",
    description: "Security & Secret Vault",
    url: "https://dosafe.me",
    iconBg: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    iconColor: "text-teal-600 dark:text-teal-400",
  },
];

export interface CroveAppSwitcherProps {
  className?: string;
  currentAppId?: string;
}

export const CroveAppSwitcher = forwardRef<HTMLButtonElement, CroveAppSwitcherProps>(
  ({ className = "", currentAppId = "cal" }, forwardedRef) => {
    const croveApps = CROVE_ECOSYSTEM_APPS.filter((app) => app.category === "crove");
    const dosApps = CROVE_ECOSYSTEM_APPS.filter((app) => app.category === "dos");

    return (
      <DropdownMenuPrimitive.Root>
        <DropdownMenuPrimitive.Trigger asChild>
          <button
            ref={forwardedRef}
            type="button"
            className={classNames(
              "hover:bg-cal-muted hover:text-emphasis text-muted group flex items-center justify-center rounded-md p-1.5 transition focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2",
              className
            )}
            title="Crove Ecosystem Apps"
            aria-label="Crove Ecosystem Apps">
            <Grid3x3Icon className="h-4 w-4 shrink-0 transition group-hover:scale-110" />
          </button>
        </DropdownMenuPrimitive.Trigger>

        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align="start"
            sideOffset={8}
            className="shadow-dropdown bg-default border-subtle relative z-50 w-80 rounded-2xl border p-3 text-sm focus:outline-none animate-in fade-in-0 zoom-in-95">
            {/* Crove Suite Section */}
            <div className="mb-3">
              <div className="text-subtle px-1 pb-2 text-xs font-semibold uppercase tracking-wider">
                Crove Suite
              </div>
              <div className="grid grid-cols-1 gap-1">
                {croveApps.map((app) => {
                  const isCurrent = app.id === currentAppId || app.isCurrent;
                  return (
                    <a
                      key={app.id}
                      href={app.url}
                      target={isCurrent ? undefined : "_blank"}
                      rel={isCurrent ? undefined : "noopener noreferrer"}
                      className={classNames(
                        "group flex items-center justify-between rounded-xl px-2.5 py-2 transition",
                        isCurrent
                          ? "bg-cal-muted text-emphasis font-medium"
                          : "hover:bg-subtle text-default hover:text-emphasis"
                      )}>
                      <div className="flex items-center gap-3">
                        <div
                          className={classNames(
                            "flex h-8 w-8 items-center justify-center rounded-lg font-bold text-xs shadow-xs",
                            app.iconBg
                          )}>
                          {app.name.replace("Crove ", "").substring(0, 3)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 text-sm">
                            <span>{app.name}</span>
                            {isCurrent && (
                              <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-subtle line-clamp-1 text-xs">{app.description}</p>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* DOS Ecosystem Section */}
            <div className="border-subtle border-t pt-2.5">
              <div className="text-subtle px-1 pb-2 text-xs font-semibold uppercase tracking-wider">
                DOS Ecosystem
              </div>
              <div className="grid grid-cols-2 gap-1">
                {dosApps.map((app) => (
                  <a
                    key={app.id}
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:bg-subtle group flex items-center gap-2 rounded-lg p-2 transition">
                    <div
                      className={classNames(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-semibold text-[10px]",
                        app.iconBg
                      )}>
                      {app.name.substring(0, 3)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-default group-hover:text-emphasis truncate text-xs font-medium">
                        {app.name}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    );
  }
);

CroveAppSwitcher.displayName = "CroveAppSwitcher";
