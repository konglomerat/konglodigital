export const buildShowcasePath = (showcase: {
  id: string;
  prettyTitle?: string | null;
}) =>
  `/showcase/${showcase.prettyTitle?.trim() ? showcase.prettyTitle : showcase.id}`;
