import OpenAI from "openai";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

type OpenAIClientOptions = {
  apiKey?: string;
  baseURL?: string;
};

export const createOpenAIClient = (options: OpenAIClientOptions = {}) => {
  const apiKey = options.apiKey ?? requiredEnv("OPENAI_API_KEY");
  const baseURL =
    options.baseURL ??
    process.env.OPENAI_BASE_URL?.trim() ??
    process.env.IMAGE_EDIT_BASE_URL?.trim() ??
    undefined;
  return new OpenAI({ apiKey, baseURL });
};
