export const PROJECT_WORKSHOP_RESOURCE_ID_PARAM = "workshopResourceId";

export const buildProjectsByWorkshopHref = (workshopResourceId: string) => {
  const normalizedWorkshopResourceId = workshopResourceId.trim();
  if (!normalizedWorkshopResourceId) {
    return "/projects";
  }

  const params = new URLSearchParams({
    [PROJECT_WORKSHOP_RESOURCE_ID_PARAM]: normalizedWorkshopResourceId,
  });

  return `/projects?${params.toString()}`;
};