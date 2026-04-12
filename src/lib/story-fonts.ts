import { Open_Sans } from "next/font/google";

export const storyOpenSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-story-open-sans",
});

export const STORY_CONTENT_FONT_FAMILY = `${storyOpenSans.style.fontFamily}, sans-serif`;
export const STORY_HEADING_FONT_FAMILY = `"Fengardo Neue", ${storyOpenSans.style.fontFamily}, sans-serif`;