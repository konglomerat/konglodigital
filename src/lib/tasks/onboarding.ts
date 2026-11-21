// Offene Onboarding-Schritte der Mitgliedsanträge als Aufgaben im Vorstand,
// Projekt „Mitgliederverwaltung“. Sie werden bei jedem Laden aus den Anträgen
// berechnet und dort erledigt — gespeichert wird nichts.
import "server-only";

import { type UserAccess, can } from "@/lib/access/access";
import { withCampaiContacts } from "@/lib/membership-applications/server";
import { listApplications } from "@/lib/membership-applications/store";
import {
  activeOnboardingItems,
  displayName,
  isOnboarding,
} from "@/lib/membership-applications/types";

import type { Task, TaskBoardData } from "./types";

const BOARD = "vorstand";
const PROJECT = "Mitgliederverwaltung";
const APPLICATIONS_HREF = "/admin/vorstand/antraege";

export const withOnboardingTasks = async (
  board: string,
  data: TaskBoardData,
  access: UserAccess | null | undefined,
): Promise<TaskBoardData> => {
  if (board !== BOARD || !can(access, "members.onboarding")) return data;
  const project = data.projects.find((entry) => entry.name === PROJECT);
  if (!project) return data;

  const applications = await withCampaiContacts(
    (await listApplications()).filter((application) => isOnboarding(application.status)),
  );
  const tasks: Task[] = applications.flatMap((application) =>
    activeOnboardingItems(application).map((item) => ({
      id: `onboarding:${application.id}:${item.key}`,
      projectId: project.id,
      title: `${displayName(application)}: ${item.label}`,
      dueDate: null,
      priority: null,
      doneAt: null,
      createdAt: application.createdAt,
      href: `${APPLICATIONS_HREF}?antrag=${encodeURIComponent(application.id)}`,
    })),
  );
  return { ...data, tasks: [...tasks, ...data.tasks] };
};
