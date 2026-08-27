import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { CROVE_ECOSYSTEM_APPS, CroveAppSwitcher } from "./CroveAppSwitcher";

vi.mock("@coss/ui/icons", () => ({
  Grid3x3Icon: (props: any) => <svg data-testid="grid-icon" {...props} />,
}));

describe("CroveAppSwitcher Component", () => {
  test("should render the app switcher trigger button with icon", () => {
    render(<CroveAppSwitcher />);
    const trigger = screen.getByRole("button", { name: /Crove Ecosystem Apps/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByTestId("grid-icon")).toBeInTheDocument();
  });

  test("should contain valid ecosystem product URLs", () => {
    expect(CROVE_ECOSYSTEM_APPS.length).toBeGreaterThanOrEqual(8);
    const calApp = CROVE_ECOSYSTEM_APPS.find((app) => app.id === "cal");
    expect(calApp?.url).toBe("https://cal.crove.com");

    const crmApp = CROVE_ECOSYSTEM_APPS.find((app) => app.id === "crm");
    expect(crmApp?.url).toBe("https://crm.crove.com");

    const postApp = CROVE_ECOSYSTEM_APPS.find((app) => app.id === "post");
    expect(postApp?.url).toBe("https://post.crove.com");
  });
});
