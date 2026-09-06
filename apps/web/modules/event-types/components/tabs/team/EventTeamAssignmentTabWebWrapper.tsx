"use client";

import type { EventTypeSetupProps } from "@calcom/features/eventtypes/lib/types";
import { EventTeamTab, type GenericTeamMember } from "./EventTeamTab";

export interface EventTeamAssignmentTabWebWrapperProps {
  eventType: EventTypeSetupProps["eventType"];
  team: EventTypeSetupProps["team"];
  teamMembers: GenericTeamMember[];
  orgId?: number | null;
}

export function EventTeamAssignmentTabWebWrapper({
  eventType,
  team,
  teamMembers,
  orgId,
}: EventTeamAssignmentTabWebWrapperProps) {
  return (
    <EventTeamTab
      eventType={eventType}
      team={team}
      teamMembers={teamMembers}
      orgId={orgId}
    />
  );
}

export default EventTeamAssignmentTabWebWrapper;
