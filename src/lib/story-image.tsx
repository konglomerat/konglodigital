import type { ReactElement } from "react";

import {
  STORY_CONTENT_FONT_FAMILY,
  STORY_HEADING_FONT_FAMILY,
} from "@/lib/story-fonts";

type StoryImageMarkupProps = {
  imageUrl: string | null;
  showTextOverlay: boolean;
  kicker: string;
  headline: string;
  body: string;
};

const rootStyle = {
  position: "relative",
  display: "flex",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "linear-gradient(135deg, #f5efe7 0%, #e7dbc5 100%)",
  color: "#111827",
} as const;

const fillStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
} as const;

const contentOuterStyle = {
  position: "relative",
  zIndex: 2,
  display: "flex",
  width: "100%",
  height: "100%",
  alignItems: "flex-end",
  padding: "56px",
} as const;

const contentCardStyle = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  gap: "16px",
  borderRadius: "46px",
  padding: "34px 38px 40px",
  background: "rgba(255, 250, 244, 0.96)",
  border: "1px solid rgba(255,255,255,0.74)",
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.14)",
} as const;

const kickerStyle = {
  display: "flex",
  fontSize: 24,
  fontWeight: 700,
  fontFamily: STORY_CONTENT_FONT_FAMILY,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "#64748b",
} as const;

const headlineStyle = {
  display: "flex",
  fontSize: 68,
  lineHeight: 1.03,
  fontWeight: 800,
  fontFamily: STORY_HEADING_FONT_FAMILY,
  color: "#111827",
  whiteSpace: "pre-wrap",
} as const;

const bodyStyle = {
  display: "flex",
  fontSize: 32,
  lineHeight: 1.32,
  fontFamily: STORY_CONTENT_FONT_FAMILY,
  color: "#334155",
  whiteSpace: "pre-wrap",
} as const;

export const createStoryImageMarkup = ({
  imageUrl,
  showTextOverlay,
  kicker,
  headline,
  body,
}: StoryImageMarkupProps): ReactElement => (
  <div style={rootStyle}>
    {imageUrl ? (
      <img
        src={imageUrl}
        alt=""
        width={1080}
        height={1920}
        style={{
          ...fillStyle,
          objectFit: "cover",
        }}
      />
    ) : (
      <div
        style={{
          ...fillStyle,
          background:
            "radial-gradient(circle at top left, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 38%), linear-gradient(135deg, #f5efe7 0%, #e7dbc5 100%)",
        }}
      />
    )}

    {showTextOverlay ? (
      <div style={contentOuterStyle}>
        <div style={contentCardStyle}>
          {kicker ? <div style={kickerStyle}>{kicker}</div> : null}
          {headline ? <div style={headlineStyle}>{headline}</div> : null}
          {body ? <div style={bodyStyle}>{body}</div> : null}
        </div>
      </div>
    ) : null}
  </div>
);