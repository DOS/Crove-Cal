"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import {
  TimeUnit,
  WorkflowActions,
  WorkflowTemplates,
  WorkflowTriggerEvents,
} from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import classNames from "@calcom/ui/classNames";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@calcom/ui/components/dialog";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { Form, Label, Select, SettingsToggle, TextAreaField, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import {
  BellIcon,
  CheckCircle2Icon,
  ClockIcon,
  CopyIcon,
  MailIcon,
  MessageSquareIcon,
  PlusIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";

interface WorkflowFormData {
  name: string;
  trigger: WorkflowTriggerEvents;
  time: number;
  timeUnit: TimeUnit;
  action: WorkflowActions;
  emailSubject: string;
  reminderBody: string;
  sendTo?: string;
  activeOn: number[];
}

const TRIGGER_LABELS: Record<WorkflowTriggerEvents, string> = {
  [WorkflowTriggerEvents.BEFORE_EVENT]: "Before Event",
  [WorkflowTriggerEvents.AFTER_EVENT]: "After Event",
  [WorkflowTriggerEvents.NEW_EVENT]: "When Event is Booked",
  [WorkflowTriggerEvents.RESCHEDULE_EVENT]: "When Event is Rescheduled",
  [WorkflowTriggerEvents.EVENT_CANCELLED]: "When Event is Cancelled",
};

const ACTION_LABELS: Record<WorkflowActions, string> = {
  [WorkflowActions.EMAIL_ATTENDEE]: "Email Attendee",
  [WorkflowActions.EMAIL_HOST]: "Email Host",
  [WorkflowActions.EMAIL_ADDRESS]: "Email Custom Address",
  [WorkflowActions.SMS_ATTENDEE]: "SMS Attendee",
  [WorkflowActions.SMS_NUMBER]: "SMS Custom Number",
  [WorkflowActions.WHATSAPP_ATTENDEE]: "WhatsApp Attendee",
  [WorkflowActions.WHATSAPP_NUMBER]: "WhatsApp Custom Number",
};

export function WorkflowsListingView() {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingWorkflowId, setEditingWorkflowId] = useState<number | null>(null);

  const { data: workflows, isLoading } = trpc.viewer.workflows.list.useQuery();
  const { data: eventTypesData } = trpc.viewer.eventTypes.list.useQuery();

  const eventTypeOptions = useMemo(() => {
    if (!eventTypesData || !Array.isArray(eventTypesData)) return [];
    return eventTypesData.map((et: { id: number; title: string }) => ({
      value: String(et.id),
      label: et.title,
    }));
  }, [eventTypesData]);

  const form = useForm<WorkflowFormData>({
    defaultValues: {
      name: "",
      trigger: WorkflowTriggerEvents.BEFORE_EVENT,
      time: 24,
      timeUnit: TimeUnit.HOUR,
      action: WorkflowActions.EMAIL_ATTENDEE,
      emailSubject: "Reminder: {EVENT_NAME} with {ORGANIZER_NAME}",
      reminderBody: "Hi {ATTENDEE_NAME},\n\nThis is a quick reminder for your upcoming meeting: {EVENT_NAME} on {EVENT_DATE} at {EVENT_TIME}.\n\nLocation: {LOCATION}\n\nSee you soon!",
      sendTo: "",
      activeOn: [],
    },
  });

  const createMutation = trpc.viewer.workflows.create.useMutation({
    onSuccess: (newWf) => {
      showToast(`Workflow "${newWf.name}" created successfully`, "success");
      setCreateDialogOpen(false);
      form.reset();
      utils.viewer.workflows.list.invalidate();
    },
    onError: (err) => {
      showToast(err.message, "error");
    },
  });

  const updateMutation = trpc.viewer.workflows.update.useMutation({
    onSuccess: (updatedWf) => {
      showToast(`Workflow "${updatedWf.name}" updated successfully`, "success");
      setCreateDialogOpen(false);
      setEditingWorkflowId(null);
      form.reset();
      utils.viewer.workflows.list.invalidate();
    },
    onError: (err) => {
      showToast(err.message, "error");
    },
  });

  const deleteMutation = trpc.viewer.workflows.delete.useMutation({
    onSuccess: () => {
      showToast("Workflow deleted successfully", "success");
      utils.viewer.workflows.list.invalidate();
    },
    onError: (err) => {
      showToast(err.message, "error");
    },
  });

  const duplicateMutation = trpc.viewer.workflows.duplicate.useMutation({
    onSuccess: (copy) => {
      showToast(`Duplicated as "${copy.name}"`, "success");
      utils.viewer.workflows.list.invalidate();
    },
    onError: (err) => {
      showToast(err.message, "error");
    },
  });

  const onSubmit = (values: WorkflowFormData) => {
    const payload = {
      name: values.name,
      trigger: values.trigger,
      time: values.trigger === WorkflowTriggerEvents.BEFORE_EVENT || values.trigger === WorkflowTriggerEvents.AFTER_EVENT ? Number(values.time) : null,
      timeUnit: values.trigger === WorkflowTriggerEvents.BEFORE_EVENT || values.trigger === WorkflowTriggerEvents.AFTER_EVENT ? values.timeUnit : null,
      steps: [
        {
          stepNumber: 1,
          action: values.action,
          emailSubject: values.emailSubject,
          reminderBody: values.reminderBody,
          sendTo: values.sendTo || null,
          template: WorkflowTemplates.REMINDER,
        },
      ],
      activeOn: values.activeOn.map(Number),
    };

    if (editingWorkflowId) {
      updateMutation.mutate({
        id: editingWorkflowId,
        ...payload,
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleOpenPreset = (preset: {
    name: string;
    trigger: WorkflowTriggerEvents;
    time: number;
    timeUnit: TimeUnit;
    action: WorkflowActions;
    subject: string;
    body: string;
  }) => {
    setEditingWorkflowId(null);
    form.reset({
      name: preset.name,
      trigger: preset.trigger,
      time: preset.time,
      timeUnit: preset.timeUnit,
      action: preset.action,
      emailSubject: preset.subject,
      reminderBody: preset.body,
      sendTo: "",
      activeOn: [],
    });
    setCreateDialogOpen(true);
  };

  const handleEditWorkflow = (wf: any) => {
    setEditingWorkflowId(wf.id);
    const firstStep = wf.steps?.[0] || {};
    form.reset({
      name: wf.name,
      trigger: wf.trigger,
      time: wf.time || 24,
      timeUnit: wf.timeUnit || TimeUnit.HOUR,
      action: firstStep.action || WorkflowActions.EMAIL_ATTENDEE,
      emailSubject: firstStep.emailSubject || "",
      reminderBody: firstStep.reminderBody || "",
      sendTo: firstStep.sendTo || "",
      activeOn: wf.activeOn?.map((a: any) => a.eventTypeId) || [],
    });
    setCreateDialogOpen(true);
  };

  const watchTrigger = form.watch("trigger");
  const isTimeOffsetTrigger =
    watchTrigger === WorkflowTriggerEvents.BEFORE_EVENT || watchTrigger === WorkflowTriggerEvents.AFTER_EVENT;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-default">{t("workflows")}</h1>
          <p className="text-sm text-subtle">
            Automate personalized email and SMS reminders, notifications, and post-meeting follow-ups.
          </p>
        </div>
        <Button
          type="button"
          StartIcon="plus"
          onClick={() => {
            setEditingWorkflowId(null);
            form.reset();
            setCreateDialogOpen(true);
          }}
          data-testid="create-workflow-button">
          New Workflow
        </Button>
      </div>

      {/* Preset Quick Start Templates */}
      <div className="rounded-xl border border-subtle bg-default p-5 shadow-xs">
        <h2 className="text-sm font-semibold text-default mb-1">Quick-Start Workflow Templates</h2>
        <p className="text-xs text-subtle mb-3.5">
          Deploy high-conversion notification automations with one click.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() =>
              handleOpenPreset({
                name: "24-Hour Email Reminder",
                trigger: WorkflowTriggerEvents.BEFORE_EVENT,
                time: 24,
                timeUnit: TimeUnit.HOUR,
                action: WorkflowActions.EMAIL_ATTENDEE,
                subject: "Reminder: {EVENT_NAME} tomorrow at {EVENT_TIME}",
                body: "Hi {ATTENDEE_NAME},\n\nThis is a quick reminder about our meeting tomorrow ({EVENT_DATE} at {EVENT_TIME}).\n\nMeeting link: {LOCATION}\n\nLooking forward to speaking with you!",
              })
            }
            className="flex flex-col justify-between rounded-xl border border-subtle p-3.5 text-left transition hover:border-emphasis hover:bg-subtle">
            <div>
              <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                <BellIcon className="h-4 w-4" />
                <span>24h Email Reminder</span>
              </div>
              <p className="mt-1.5 text-xs text-subtle line-clamp-2">
                Send a polite calendar reminder 24 hours before the meeting starts.
              </p>
            </div>
            <span className="mt-3 text-[11px] font-medium text-primary">Use Template &rarr;</span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleOpenPreset({
                name: "1-Hour SMS Urgency Reminder",
                trigger: WorkflowTriggerEvents.BEFORE_EVENT,
                time: 1,
                timeUnit: TimeUnit.HOUR,
                action: WorkflowActions.SMS_ATTENDEE,
                subject: "",
                body: "Reminder: {EVENT_NAME} with {ORGANIZER_NAME} starts in 1 hour at {EVENT_TIME}. Join link: {LOCATION}",
              })
            }
            className="flex flex-col justify-between rounded-xl border border-subtle p-3.5 text-left transition hover:border-emphasis hover:bg-subtle">
            <div>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-xs">
                <MessageSquareIcon className="h-4 w-4" />
                <span>1h SMS Reminder</span>
              </div>
              <p className="mt-1.5 text-xs text-subtle line-clamp-2">
                Minimize meeting no-shows with an instant text message 1 hour prior.
              </p>
            </div>
            <span className="mt-3 text-[11px] font-medium text-primary">Use Template &rarr;</span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleOpenPreset({
                name: "Post-Meeting Thank You & Survey",
                trigger: WorkflowTriggerEvents.AFTER_EVENT,
                time: 30,
                timeUnit: TimeUnit.MINUTE,
                action: WorkflowActions.EMAIL_ATTENDEE,
                subject: "Thank you for meeting today! - {EVENT_NAME}",
                body: "Hi {ATTENDEE_NAME},\n\nThank you for taking the time to speak today! Please let us know if you have any questions or feedback.\n\nBest regards,\n{ORGANIZER_NAME}",
              })
            }
            className="flex flex-col justify-between rounded-xl border border-subtle p-3.5 text-left transition hover:border-emphasis hover:bg-subtle">
            <div>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                <MailIcon className="h-4 w-4" />
                <span>Follow-Up & Feedback</span>
              </div>
              <p className="mt-1.5 text-xs text-subtle line-clamp-2">
                Automatically follow up with materials or a survey 30 minutes after meeting ends.
              </p>
            </div>
            <span className="mt-3 text-[11px] font-medium text-primary">Use Template &rarr;</span>
          </button>
        </div>
      </div>

      {/* Workflows List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-cal-muted" />
          ))}
        </div>
      ) : workflows && workflows.length > 0 ? (
        <div className="space-y-3">
          {workflows.map((wf) => {
            const firstStep = wf.steps?.[0];
            const isEmail = firstStep?.action?.startsWith("EMAIL");

            return (
              <div
                key={wf.id}
                className="flex flex-col justify-between rounded-xl border border-subtle bg-default p-5 shadow-xs transition hover:border-emphasis sm:flex-row sm:items-center">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-semibold text-sm text-default">{wf.name}</h3>
                    <Badge variant={wf.active ? "green" : "gray"}>
                      {wf.active ? "Active" : "Disabled"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-subtle">
                    <div className="flex items-center gap-1">
                      <ClockIcon className="h-3.5 w-3.5" />
                      <span>
                        {wf.time ? `${wf.time} ${wf.timeUnit?.toLowerCase()}(s) ` : ""}
                        {TRIGGER_LABELS[wf.trigger] || wf.trigger}
                      </span>
                    </div>

                    <span>&bull;</span>

                    <div className="flex items-center gap-1">
                      {isEmail ? <MailIcon className="h-3.5 w-3.5" /> : <MessageSquareIcon className="h-3.5 w-3.5" />}
                      <span>{firstStep ? ACTION_LABELS[firstStep.action] || firstStep.action : "No action"}</span>
                    </div>

                    <span>&bull;</span>

                    <span>
                      {wf.activeOn.length === 0
                        ? "Applied to all Event Types"
                        : `${wf.activeOn.length} Event Type(s)`}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 sm:mt-0">
                  <Button
                    type="button"
                    size="sm"
                    color="secondary"
                    onClick={() => handleEditWorkflow(wf)}>
                    Edit
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    color="secondary"
                    variant="icon"
                    title="Duplicate Workflow"
                    onClick={() => duplicateMutation.mutate({ id: wf.id })}>
                    <CopyIcon className="h-4 w-4" />
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    color="destructive"
                    variant="icon"
                    title="Delete Workflow"
                    onClick={() => deleteMutation.mutate({ id: wf.id })}>
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyScreen
          Icon="zap"
          headline="No workflows created yet"
          description="Build notification workflows to automatically send reminders, SMS messages, and follow-ups around scheduled meetings."
          buttonRaw={
            <Button
              onClick={() => {
                setEditingWorkflowId(null);
                form.reset();
                setCreateDialogOpen(true);
              }}>
              Create Workflow
            </Button>
          }
        />
      )}

      {/* Create / Edit Workflow Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader
            title={editingWorkflowId ? "Edit Workflow" : "Create Notification Workflow"}
            subtitle="Configure meeting triggers, communication channels, and dynamic template content."
          />

          <Form form={form} handleSubmit={onSubmit}>
            <div className="space-y-4 py-2 text-sm">
              <div>
                <Label htmlFor="name">Workflow Name</Label>
                <TextField
                  id="name"
                  placeholder="e.g. 24h Before Meeting Reminder"
                  {...form.register("name", { required: true })}
                />
              </div>

              {/* Trigger Selection */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="trigger">When Should This Run?</Label>
                  <Controller
                    name="trigger"
                    control={form.control}
                    render={({ field: { value, onChange } }) => (
                      <select
                        id="trigger"
                        value={value}
                        onChange={(e) => onChange(e.target.value as WorkflowTriggerEvents)}
                        className="w-full rounded-md border border-subtle bg-default px-3 py-2 text-sm focus:border-emphasis focus:outline-none">
                        {Object.entries(TRIGGER_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                </div>

                {isTimeOffsetTrigger && (
                  <div className="flex gap-2">
                    <div className="w-1/2">
                      <Label htmlFor="time">Time Offset</Label>
                      <TextField
                        id="time"
                        type="number"
                        min="1"
                        {...form.register("time", { required: true, valueAsNumber: true })}
                      />
                    </div>
                    <div className="w-1/2">
                      <Label htmlFor="timeUnit">Unit</Label>
                      <Controller
                        name="timeUnit"
                        control={form.control}
                        render={({ field: { value, onChange } }) => (
                          <select
                            id="timeUnit"
                            value={value}
                            onChange={(e) => onChange(e.target.value as TimeUnit)}
                            className="w-full rounded-md border border-subtle bg-default px-3 py-2 text-sm focus:border-emphasis focus:outline-none">
                            <option value={TimeUnit.MINUTE}>Minute(s)</option>
                            <option value={TimeUnit.HOUR}>Hour(s)</option>
                            <option value={TimeUnit.DAY}>Day(s)</option>
                          </select>
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Type */}
              <div>
                <Label htmlFor="action">Action / Channel</Label>
                <Controller
                  name="action"
                  control={form.control}
                  render={({ field: { value, onChange } }) => (
                    <select
                      id="action"
                      value={value}
                      onChange={(e) => onChange(e.target.value as WorkflowActions)}
                      className="w-full rounded-md border border-subtle bg-default px-3 py-2 text-sm focus:border-emphasis focus:outline-none">
                      {Object.entries(ACTION_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                />
              </div>

              {/* Email Subject (if email action) */}
              {form.watch("action").startsWith("EMAIL") && (
                <div>
                  <Label htmlFor="emailSubject">Email Subject</Label>
                  <TextField
                    id="emailSubject"
                    placeholder="Reminder: {EVENT_NAME} with {ORGANIZER_NAME}"
                    {...form.register("emailSubject")}
                  />
                </div>
              )}

              {/* Reminder Body */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="reminderBody">Message Body</Label>
                  <span className="text-[11px] text-subtle">
                    Supports: &#123;EVENT_NAME&#125;, &#123;ATTENDEE_NAME&#125;, &#123;ORGANIZER_NAME&#125;, &#123;EVENT_DATE&#125;, &#123;EVENT_TIME&#125;, &#123;LOCATION&#125;
                  </span>
                </div>
                <TextAreaField
                  id="reminderBody"
                  rows={4}
                  placeholder="Hi {ATTENDEE_NAME}, see you at {EVENT_TIME}!"
                  {...form.register("reminderBody", { required: true })}
                />
              </div>

              {/* Event Types Target */}
              {eventTypeOptions.length > 0 && (
                <div>
                  <Label>Apply to Event Types</Label>
                  <p className="text-xs text-subtle mb-1.5">
                    Leave unselected to apply this workflow across all event types.
                  </p>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-md border border-subtle p-2.5">
                    {eventTypeOptions.map((opt) => {
                      const activeOnList = form.watch("activeOn") || [];
                      const isChecked = activeOnList.includes(Number(opt.value));

                      return (
                        <label
                          key={opt.value}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-subtle">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const numId = Number(opt.value);
                              const current = form.getValues("activeOn") || [];
                              if (e.target.checked) {
                                form.setValue("activeOn", [...current, numId]);
                              } else {
                                form.setValue(
                                  "activeOn",
                                  current.filter((id) => id !== numId)
                                );
                              }
                            }}
                            className="rounded border-subtle text-primary focus:ring-primary"
                          />
                          <span className="text-xs text-default font-medium">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-6">
              <DialogClose />
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {editingWorkflowId ? "Save Changes" : "Create Workflow"}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WorkflowsListingView;
