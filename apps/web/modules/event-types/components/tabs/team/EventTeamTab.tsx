"use client";

import AssignAllTeamMembers from "@calcom/features/eventtypes/components/AssignAllTeamMembers";
import CheckedTeamSelect, { type CheckedSelectOption } from "@calcom/features/eventtypes/components/CheckedTeamSelect";
import type { EventTypeSetupProps, FormValues } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SchedulingType } from "@calcom/prisma/enums";
import classNames from "@calcom/ui/classNames";
import { Badge } from "@calcom/ui/components/badge";
import { Label, SettingsToggle } from "@calcom/ui/components/form";
import { RefreshCwIcon, UsersIcon, LayersIcon, ShieldCheckIcon, UserCheckIcon } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

export type GenericTeamMember = {
  id?: number;
  value?: string;
  label?: string | null;
  name?: string | null;
  email: string;
  avatar?: string | null;
  avatarUrl?: string | null;
  defaultScheduleId?: number | null;
};

export interface EventTeamTabProps {
  eventType: EventTypeSetupProps["eventType"];
  team: EventTypeSetupProps["team"];
  teamMembers: GenericTeamMember[];
  orgId?: number | null;
}

export function EventTeamTab({ eventType, team, teamMembers = [], orgId }: EventTeamTabProps) {
  const { t } = useLocale();
  const form = useFormContext<FormValues>();

  const watchSchedulingType = form.watch("schedulingType") || eventType.schedulingType || SchedulingType.ROUND_ROBIN;
  const watchHosts = form.watch("hosts") || [];
  const watchIsRRWeightsEnabled = form.watch("isRRWeightsEnabled") ?? false;
  const watchAssignAll = form.watch("assignAllTeamMembers") ?? false;
  const [assignAllTeamMembers, setAssignAllTeamMembers] = useState(watchAssignAll);

  // Convert TeamMembers to options for CheckedTeamSelect
  const memberOptions: CheckedSelectOption[] = useMemo(() => {
    return teamMembers.map((member) => {
      const val = member.value ?? String(member.id ?? "");
      const lbl = member.label ?? member.name ?? member.email;
      const avt = member.avatar ?? member.avatarUrl ?? "";
      return {
        value: val,
        label: lbl,
        avatar: avt,
        defaultScheduleId: member.defaultScheduleId ?? null,
        groupId: null,
      };
    });
  }, [teamMembers]);

  // Convert current selected hosts in form to CheckedSelectOption[]
  const selectedHostOptions: CheckedSelectOption[] = useMemo(() => {
    return watchHosts.map((host) => {
      const member = teamMembers.find(
        (m) => (m.value !== undefined && Number(m.value) === host.userId) || (m.id !== undefined && m.id === host.userId)
      );
      return {
        value: String(host.userId),
        label: member?.label ?? member?.name ?? member?.email ?? `User #${host.userId}`,
        avatar: member?.avatar ?? member?.avatarUrl ?? "",
        defaultScheduleId: host.scheduleId ?? member?.defaultScheduleId ?? null,
        priority: host.priority ?? 2,
        weight: host.weight ?? 100,
        isFixed: host.isFixed ?? false,
        groupId: host.groupId ?? null,
      };
    });
  }, [watchHosts, teamMembers]);

  const handleHostsChange = (newOptions: readonly CheckedSelectOption[]) => {
    const updatedHosts = newOptions.map((opt) => ({
      userId: Number(opt.value),
      isFixed: opt.isFixed ?? false,
      priority: opt.priority ?? 2,
      weight: opt.weight ?? 100,
      scheduleId: opt.defaultScheduleId ?? null,
      groupId: opt.groupId ?? null,
    }));

    form.setValue("hosts", updatedHosts, { shouldDirty: true });
  };

  const handleSelectSchedulingType = (type: SchedulingType) => {
    form.setValue("schedulingType", type, { shouldDirty: true });
  };

  const schedulingTypeCards = [
    {
      type: SchedulingType.ROUND_ROBIN,
      title: "Round-Robin",
      description: "Distribute incoming bookings and leads among available team members (evenly or weighted).",
      icon: RefreshCwIcon,
      badge: "Most Popular",
    },
    {
      type: SchedulingType.COLLECTIVE,
      title: "Collective",
      description: "Allow clients to book a group meeting when ALL selected team members are free at once.",
      icon: UsersIcon,
      badge: "All-Hands",
    },
    {
      type: SchedulingType.MANAGED,
      title: "Managed Event",
      description: "Organization admin template distributed to all member calendars with locked settings.",
      icon: LayersIcon,
      badge: "Enterprise",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Section 1: Scheduling Type Strategy Selection */}
      <div className="rounded-xl border border-subtle bg-default p-5 shadow-xs">
        <div>
          <h2 className="text-base font-semibold text-default">Team Scheduling Strategy</h2>
          <p className="mt-1 text-sm text-subtle">
            Select how bookings for this team event type will be assigned among team members.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {schedulingTypeCards.map((card) => {
            const isSelected = watchSchedulingType === card.type;
            const IconComponent = card.icon;

            return (
              <button
                key={card.type}
                type="button"
                onClick={() => handleSelectSchedulingType(card.type)}
                className={classNames(
                  "flex flex-col justify-between rounded-xl border p-4 text-left transition",
                  isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-1"
                    : "border-subtle bg-default hover:border-emphasis hover:bg-subtle"
                )}>
                <div>
                  <div className="flex items-center justify-between">
                    <div
                      className={classNames(
                        "flex h-9 w-9 items-center justify-center rounded-lg",
                        isSelected ? "bg-primary text-white" : "bg-cal-muted text-default"
                      )}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    {isSelected ? (
                      <Badge variant="blue">Active</Badge>
                    ) : (
                      <span className="text-[11px] text-subtle font-medium">{card.badge}</span>
                    )}
                  </div>

                  <h3 className="mt-3 font-semibold text-sm text-default">{card.title}</h3>
                  <p className="mt-1 line-clamp-3 text-xs text-subtle">{card.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Round-Robin Advanced Distribution Controls */}
      {watchSchedulingType === SchedulingType.ROUND_ROBIN && (
        <div className="rounded-xl border border-subtle bg-default p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <UserCheckIcon className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-default">Round-Robin Assignment Settings</h2>
          </div>

          <div className="divide-y divide-subtle">
            {/* Toggle: Weighted Lead Distribution */}
            <div className="py-3">
              <Controller
                name="isRRWeightsEnabled"
                control={form.control}
                render={({ field: { value, onChange } }) => (
                  <SettingsToggle
                    title="Enable Weighted Distribution"
                    description="Assign custom percentages/weights to hosts (e.g. Senior Rep 70%, Junior Rep 30%)."
                    checked={value ?? false}
                    onCheckedChange={(checked) => {
                      onChange(checked);
                      form.setValue("isRRWeightsEnabled", checked, { shouldDirty: true });
                    }}
                  />
                )}
              />
            </div>

            {/* Toggle: Reschedule with Same Host */}
            <div className="py-3">
              <Controller
                name="rescheduleWithSameRoundRobinHost"
                control={form.control}
                render={({ field: { value, onChange } }) => (
                  <SettingsToggle
                    title="Reschedule with Same Host"
                    description="When an attendee reschedules, automatically reassign them to the same team member."
                    checked={value ?? false}
                    onCheckedChange={(checked) => {
                      onChange(checked);
                      form.setValue("rescheduleWithSameRoundRobinHost", checked, { shouldDirty: true });
                    }}
                  />
                )}
              />
            </div>

            {/* Toggle: Enable Per-Host Locations */}
            <div className="py-3">
              <Controller
                name="enablePerHostLocations"
                control={form.control}
                render={({ field: { value, onChange } }) => (
                  <SettingsToggle
                    title="Allow Per-Host Meeting Locations"
                    description="Each assigned team member can provide their personal Zoom, Google Meet, or Phone location."
                    checked={value ?? false}
                    onCheckedChange={(checked) => {
                      onChange(checked);
                      form.setValue("enablePerHostLocations", checked, { shouldDirty: true });
                    }}
                  />
                )}
              />
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Team Hosts Assignment */}
      <div className="rounded-xl border border-subtle bg-default p-5 shadow-xs">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-default">Assigned Hosts</h2>
            <p className="mt-1 text-sm text-subtle">
              Choose which team members participate in this event type and customize their priorities.
            </p>
          </div>

          <AssignAllTeamMembers
            assignAllTeamMembers={assignAllTeamMembers}
            setAssignAllTeamMembers={setAssignAllTeamMembers}
            onActive={() => {
              const allHosts: CheckedSelectOption[] = memberOptions.map((opt) => ({
                ...opt,
                priority: 2,
                weight: 100,
                isFixed: false,
              }));
              handleHostsChange(allHosts);
            }}
            onInactive={() => {
              handleHostsChange([]);
            }}
          />
        </div>

        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">
            Select Team Members
          </Label>

          <CheckedTeamSelect
            options={memberOptions}
            value={selectedHostOptions}
            onChange={handleHostsChange}
            isRRWeightsEnabled={watchIsRRWeightsEnabled}
            groupId={null}
            placeholder="Search and add team members..."
          />
        </div>
      </div>
    </div>
  );
}

export default EventTeamTab;
