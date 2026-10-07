// Wer darf eine Ressource bearbeiten oder löschen? Anlegen darf jedes
// angemeldete Mitglied. Eigene Einträge darf man immer bearbeiten, fremde nur
// mit resources.edit (Inventar) bzw. showcase.edit (Showcases). Löschen:
// Inventar nur mit resources.delete, eigene Showcases auch ohne Rolle.
import { type UserAccess, can } from "@/lib/access/access";
import { isShowcaseResourceType } from "@/lib/showcase-resource-type";

export type ResourceAccessTarget = {
  ownerId: string | null | undefined;
  type: string | null | undefined;
};

type AccessInput = UserAccess | null | undefined;

const isOwn = (access: AccessInput, resource: ResourceAccessTarget) =>
  Boolean(access && resource.ownerId && resource.ownerId === access.userId);

export const canEditResource = (
  access: AccessInput,
  resource: ResourceAccessTarget,
) =>
  isOwn(access, resource) ||
  can(
    access,
    isShowcaseResourceType(resource.type) ? "showcase.edit" : "resources.edit",
  );

export const canDeleteResource = (
  access: AccessInput,
  resource: ResourceAccessTarget,
) =>
  isShowcaseResourceType(resource.type)
    ? isOwn(access, resource) || can(access, "showcase.edit")
    : can(access, "resources.delete");
