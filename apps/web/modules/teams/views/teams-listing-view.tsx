"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import classNames from "@calcom/ui/classNames";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@calcom/ui/components/dialog";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { Form, Label, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { PlusIcon, UsersIcon } from "@coss/ui/icons";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

interface CreateTeamFormValues {
  name: string;
  slug?: string;
  description?: string;
}

export function TeamsListingView() {
  const { t } = useLocale();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: teams, isLoading } = trpc.viewer.teams.list.useQuery({
    includeOrgs: true,
  });

  const form = useForm<CreateTeamFormValues>({
    defaultValues: {
      name: "",
      slug: "",
      description: "",
    },
  });

  const createTeamMutation = trpc.viewer.teams.create.useMutation({
    onSuccess: (newTeam) => {
      showToast(t("team_created_successfully", { teamName: newTeam.name }), "success");
      setCreateDialogOpen(false);
      form.reset();
      utils.viewer.teams.list.invalidate();
    },
    onError: (err) => {
      showToast(err.message, "error");
    },
  });

  const onSubmit = (values: CreateTeamFormValues) => {
    createTeamMutation.mutate({
      name: values.name,
      slug: values.slug || undefined,
      description: values.description || undefined,
    });
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* Top Header & CTA */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-default">{t("teams")}</h1>
          <p className="text-sm text-subtle">
            Manage multi-tenant organizations, departments, and round-robin teams.
          </p>
        </div>
        <Button
          type="button"
          StartIcon={PlusIcon}
          onClick={() => setCreateDialogOpen(true)}
          data-testid="create-team-button">
          {t("create_a_team")}
        </Button>
      </div>

      {/* Teams and Organizations List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-cal-muted" />
          ))}
        </div>
      ) : teams && teams.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex flex-col justify-between rounded-xl border border-subtle bg-default p-5 shadow-xs transition hover:border-emphasis">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar alt={team.name} size="md" imageSrc={team.logoUrl} />
                    <div>
                      <h3 className="font-semibold text-default">{team.name}</h3>
                      <p className="text-xs text-subtle">/{team.slug}</p>
                    </div>
                  </div>
                  {team.isOrganization ? (
                    <Badge variant="blue">Organization</Badge>
                  ) : (
                    <Badge variant="gray">Team</Badge>
                  )}
                </div>

                {team.bio && <p className="mt-3 line-clamp-2 text-xs text-subtle">{team.bio}</p>}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-subtle pt-4 text-xs text-subtle">
                <div className="flex items-center gap-1.5">
                  <UsersIcon className="h-3.5 w-3.5" />
                  <span>
                    {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-default uppercase">{team.role}</span>
                  <Link
                    href={`/event-types?teamId=${team.id}`}
                    className="font-medium text-primary hover:underline">
                    Events &rarr;
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyScreen
          Icon={UsersIcon}
          headline={t("no_teams_yet")}
          description={t("create_team_description")}
          buttonRaw={
            <Button onClick={() => setCreateDialogOpen(true)} variant="button">
              {t("create_a_team")}
            </Button>
          }
        />
      )}

      {/* Create Team Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader
            title={t("create_a_team")}
            subtitle="Create a new shared team or department for booking."
          />

          <Form form={form} handleSubmit={onSubmit}>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="name">{t("name")}</Label>
                <TextField
                  id="name"
                  placeholder="e.g. Sales, Support, Leadership"
                  {...form.register("name", { required: true })}
                />
              </div>

              <div>
                <Label htmlFor="slug">{t("slug")}</Label>
                <TextField id="slug" placeholder="sales" {...form.register("slug")} />
              </div>

              <div>
                <Label htmlFor="description">{t("description")}</Label>
                <TextField
                  id="description"
                  placeholder="Team mission or purpose"
                  {...form.register("description")}
                />
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" color="secondary" onClick={() => setCreateDialogOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" loading={createTeamMutation.isPending}>
                {t("create")}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
