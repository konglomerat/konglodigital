export const buildTranslationKey = (sourceText: string): string => {
  return sourceText.trim().replace(/\s+/g, " ");
};
