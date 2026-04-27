export const buildProjectPath = (project: {
  id: string;
  prettyTitle?: string | null;
}) =>
  `/projects/${project.prettyTitle?.trim() ? project.prettyTitle : project.id}`;
