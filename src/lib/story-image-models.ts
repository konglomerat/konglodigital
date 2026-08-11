export const DEFAULT_STORY_IMAGE_MODEL = "gemini-3.1-flash-image" as const;

export const STORY_IMAGE_MODELS = [
  DEFAULT_STORY_IMAGE_MODEL,
  "gemini-3.1-flash-lite-image",
  "gpt-image-2",
] as const;

export type StoryImageModel = (typeof STORY_IMAGE_MODELS)[number];

export const isStoryImageModel = (
  value: unknown,
): value is StoryImageModel =>
  typeof value === "string" &&
  STORY_IMAGE_MODELS.some((model) => model === value);

export const isOpenAIStoryImageModel = (model: StoryImageModel) =>
  model === "gpt-image-2";
