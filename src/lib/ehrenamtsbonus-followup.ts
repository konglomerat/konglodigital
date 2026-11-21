// Ehrenamtsbonus — die Folgen einer Entscheidung, nachdem der Status
// gespeichert ist: Abo in Campai pausieren, dem Mitglied über Campai
// schreiben, Roseguarden-Schritte als Aufgaben für den Vorstand anlegen.
//
// Jeder Schritt läuft für sich; schlägt einer fehl, laufen die anderen
// trotzdem. Das Ergebnis geht nur mit der Antwort zurück, gespeichert wird es
// nicht. Die Entscheidung selbst bleibt in jedem Fall bestehen.
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type EhrenamtsbonusCampaiSync,
  type EhrenamtsbonusRequest,
  type EhrenamtsbonusSyncStep,
  quarterLabelForDate,
  resolveOutcome,
} from "./ehrenamtsbonus";
import {
  approvalMessage,
  cancellationMessage,
  pauseAboForBonus,
  pausesAbo,
  rejectionMessage,
  sendMemberMessage,
  unpauseAboForBonus,
} from "./ehrenamtsbonus-campai";
import { getMemberProfileByUserId } from "./member-profiles";
import { createTask, findProjectByName } from "./tasks/store";

const TASK_BOARD = "vorstand";
const TASK_PROJECT = "Mitgliederverwaltung";

export type FollowUpStep = keyof EhrenamtsbonusCampaiSync;
export type FollowUpAction = "approve" | "reject" | "cancel";

const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "Unbekannter Fehler.";

const formatDay = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
};

const run = async (
  work: () => Promise<string>,
): Promise<EhrenamtsbonusSyncStep> => {
  const at = new Date().toISOString();
  try {
    return { status: "ok", at, detail: await work() };
  } catch (error) {
    return { status: "error", at, detail: messageOf(error) };
  }
};

/** Welche Schritte zu einer Entscheidung gehören. */
export const stepsFor = (
  request: EhrenamtsbonusRequest,
  action: FollowUpAction,
): FollowUpStep[] => {
  if (action === "reject") return ["message"];
  if (action === "cancel") {
    return [...(pausesAbo(request) ? (["unpause"] as const) : []), "message"];
  }
  const roseguarden = resolveOutcome(
    request.currentAccess,
    request.requestedOption,
  ).actions.some((entry) => entry.target === "roseguarden");
  return [
    ...(pausesAbo(request) ? (["pause"] as const) : []),
    "message",
    ...(roseguarden ? (["tasks"] as const) : []),
  ];
};

/** Führt die Schritte aus und meldet je Schritt, ob er geklappt hat. */
export const runFollowUp = async ({
  client,
  request,
  action,
  note,
  actorId,
  only,
}: {
  client: SupabaseClient;
  request: EhrenamtsbonusRequest;
  action: FollowUpAction;
  note: string | null;
  actorId: string;
  /** Nur diese Schritte (erneuter Versuch). */
  only?: FollowUpStep[];
}): Promise<EhrenamtsbonusCampaiSync> => {
  const steps = stepsFor(request, action).filter(
    (step) => !only || only.includes(step),
  );
  const profile = await getMemberProfileByUserId(client, request.userId).catch(
    () => null,
  );
  const contactId = profile?.campaiContactId?.trim() || null;
  const name = profile?.campaiName?.trim() || null;
  const firstName = name?.split(/\s+/)[0] ?? null;
  const requireContact = () => {
    if (!contactId)
      throw new Error("Das Mitglied ist mit keinem Campai-Kontakt verknüpft.");
    return contactId;
  };

  const sync: EhrenamtsbonusCampaiSync = {};

  if (steps.includes("pause")) {
    sync.pause = await run(async () => {
      const { contracts } = await pauseAboForBonus(
        requireContact(),
        request.validFrom,
        request.validUntil,
      );
      return `${contracts.map((contract) => contract.plan).join(", ")} pausiert vom ${formatDay(
        request.validFrom,
      )} bis ${formatDay(request.validUntil)}.`;
    });
  }

  if (steps.includes("unpause")) {
    sync.unpause = await run(async () => {
      const { contracts } = await unpauseAboForBonus(
        requireContact(),
        request.validFrom,
      );
      return contracts.length > 0
        ? `Pause aufgehoben: ${contracts.map((contract) => contract.plan).join(", ")}.`
        : "Keine Pause dieses Bonus in Campai gefunden.";
    });
  }

  if (steps.includes("message")) {
    sync.message = await run(async () => {
      const message =
        action === "approve"
          ? approvalMessage(request, firstName)
          : action === "cancel"
            ? cancellationMessage(request, firstName, note ?? "")
            : rejectionMessage(request, firstName, note ?? "");
      await sendMemberMessage(requireContact(), message.subject, message.body);
      return `„${message.subject}“ verschickt.`;
    });
  }

  if (steps.includes("tasks")) {
    sync.tasks = await run(async () => {
      const project = await findProjectByName(TASK_BOARD, TASK_PROJECT);
      if (!project)
        throw new Error(
          `Projekt „${TASK_PROJECT}“ fehlt in der Aufgabenliste.`,
        );
      const period = quarterLabelForDate(request.validFrom);
      const actions = resolveOutcome(
        request.currentAccess,
        request.requestedOption,
      ).actions.filter((entry) => entry.target === "roseguarden");
      for (const entry of actions) {
        await createTask({
          projectId: project.id,
          title: `Roseguarden: ${entry.label} – ${name ?? "Mitglied"} (Ehrenamtsbonus ${period})`,
          // Bis zum Beginn des Bonus muss es erledigt sein.
          dueDate: request.validFrom,
          priority: null,
          createdBy: actorId,
        });
      }
      return `${actions.length} ${actions.length === 1 ? "Aufgabe" : "Aufgaben"} unter „${TASK_PROJECT}“ angelegt.`;
    });
  }

  return sync;
};
