import BaseEmail from "./_base-email";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Minimal workflow reminder email: subject and body come from the workflow step
 * (already variable-substituted by the dispatcher), so no calendar event payload
 * is needed here.
 */
export class WorkflowReminderEmail extends BaseEmail {
  name = "WORKFLOW_REMINDER";

  constructor(
    private mail: {
      to: string;
      subject: string;
      text: string;
    }
  ) {
    super();
  }

  protected async getNodeMailerPayload() {
    const html = this.mail.text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("\n");

    return {
      to: this.mail.to,
      subject: this.mail.subject,
      text: this.mail.text,
      html,
    };
  }
}
