import { render, screen } from "@testing-library/react";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { describe, expect, it, vi } from "vitest";
import { EventTeamTab } from "../EventTeamTab";
import { SchedulingType } from "@calcom/prisma/enums";

vi.mock("@formkit/auto-animate/react", () => ({
  useAutoAnimate: () => [{ current: null }],
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

const mockTeamMembers = [
  { id: 1, name: "Alice Nguyen", email: "alice@crove.com", avatar: "avatar1.png" },
  { id: 2, name: "Bob Tran", email: "bob@crove.com", avatar: "avatar2.png" },
  { id: 3, name: "Charlie Le", email: "charlie@crove.com", avatar: "avatar3.png" },
];

const mockEventType: any = {
  id: 101,
  title: "Team Discovery 30m",
  slug: "team-discovery",
  schedulingType: SchedulingType.ROUND_ROBIN,
  hosts: [
    { userId: 1, priority: 1, weight: 100, isFixed: true, groupId: null },
    { userId: 2, priority: 2, weight: 50, isFixed: false, groupId: null },
  ],
  assignAllTeamMembers: false,
  isRRWeightsEnabled: true,
};

function TestWrapper({ defaultValues = {} }: { defaultValues?: any }) {
  const form = useForm({
    defaultValues: {
      schedulingType: SchedulingType.ROUND_ROBIN,
      hosts: mockEventType.hosts,
      isRRWeightsEnabled: true,
      assignAllTeamMembers: false,
      rescheduleWithSameRoundRobinHost: false,
      enablePerHostLocations: false,
      ...defaultValues,
    },
  });

  return (
    <TooltipProvider>
      <FormProvider {...form}>
        <EventTeamTab
          eventType={mockEventType}
          team={{ id: 10, name: "Sales & Outreach", slug: "sales" } as any}
          teamMembers={mockTeamMembers as any}
        />
      </FormProvider>
    </TooltipProvider>
  );
}

describe("EventTeamTab Component", () => {
  it("renders team scheduling strategy cards (Round-Robin, Collective, Managed)", () => {
    render(<TestWrapper />);

    expect(screen.getByText("Team Scheduling Strategy")).toBeInTheDocument();
    expect(screen.getByText("Round-Robin")).toBeInTheDocument();
    expect(screen.getByText("Collective")).toBeInTheDocument();
    expect(screen.getByText("Managed Event")).toBeInTheDocument();
  });

  it("displays Round-Robin settings (weights toggle, reschedule same host) when Round-Robin is selected", () => {
    render(<TestWrapper />);

    expect(screen.getByText("Round-Robin Assignment Settings")).toBeInTheDocument();
    expect(screen.getByText("Enable Weighted Distribution")).toBeInTheDocument();
    expect(screen.getByText("Reschedule with Same Host")).toBeInTheDocument();
  });

  it("displays assigned hosts and team members list", () => {
    render(<TestWrapper />);

    expect(screen.getByText("Assigned Hosts")).toBeInTheDocument();
    expect(screen.getAllByText("Alice Nguyen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bob Tran").length).toBeGreaterThanOrEqual(1);
  });
});
