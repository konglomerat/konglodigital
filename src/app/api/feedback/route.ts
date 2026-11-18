// Feedback-Button: Fehler werden öffentlich zu GitHub-Issues, Ideen zu
// GitHub-Discussions.
import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";

import {
  FEEDBACK_SCREENSHOT_MAX_BYTES,
  FEEDBACK_SCREENSHOT_MAX_EDGE,
  buildGithubFeedbackBody,
  describeFeedbackEnvironment,
  parseFeedbackSubmission,
  type FeedbackResponse,
} from "@/lib/feedback/feedback";
import { publishFeedbackToGithub } from "@/lib/feedback/github";
import { mailFeedbackConfirmation } from "@/lib/feedback/mails";
import { uploadOpeninaryMedia } from "@/lib/openinary-server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const parseJson = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

// Neu kodieren entfernt Metadaten wie GPS-Daten und stellt sicher, dass
// wirklich ein Bild ankommt, bevor es öffentlich wird.
const normalizeScreenshot = async (file: File) =>
  sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({
      width: FEEDBACK_SCREENSHOT_MAX_EDGE,
      height: FEEDBACK_SCREENSHOT_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.email) {
    return NextResponse.json(
      { error: "Bitte melde dich an, um Feedback zu senden." },
      { status: 401 },
    );
  }

  const form = await request.formData().catch(() => null);
  const submission = form
    ? parseFeedbackSubmission({
        type: form.get("type"),
        name: form.get("name"),
        message: form.get("message"),
        context: parseJson(form.get("context")),
      })
    : null;
  if (!form || !submission) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const upload = form.get("screenshot");
  const screenshotFile = upload instanceof File && upload.size > 0 ? upload : null;
  if (screenshotFile && screenshotFile.size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
    return NextResponse.json(
      { error: "Das Bild ist zu groß." },
      { status: 413 },
    );
  }

  let screenshot: Buffer | null = null;
  if (screenshotFile) {
    try {
      screenshot = await normalizeScreenshot(screenshotFile);
    } catch {
      return NextResponse.json(
        { error: "Das Bild konnte nicht gelesen werden." },
        { status: 400 },
      );
    }
  }

  const environment = describeFeedbackEnvironment(
    request.headers.get("user-agent") ?? "",
    submission.context.touch,
  );

  let url: string;
  try {
    const uploaded = screenshot
      ? await uploadOpeninaryMedia({
          data: screenshot,
          contentType: "image/jpeg",
          path: `feedback/${randomUUID()}.jpg`,
        })
      : null;
    url = await publishFeedbackToGithub({
      type: submission.type,
      title: submission.title,
      body: buildGithubFeedbackBody({
        type: submission.type,
        name: submission.name,
        message: submission.message,
        context: submission.context,
        environment,
        screenshotUrl: uploaded?.url ?? null,
      }),
    });
  } catch (error) {
    console.error("[feedback] publishing failed", error);
    return NextResponse.json(
      { error: "Das Feedback ist nicht angekommen." },
      { status: 503 },
    );
  }

  // Der Eintrag steht — eine fehlende Bestätigung ist kein Fehler mehr.
  try {
    await mailFeedbackConfirmation({ email: user.email, submission, url });
  } catch (error) {
    console.error("[feedback] confirmation mail failed", error);
  }

  return NextResponse.json({ url } satisfies FeedbackResponse);
};
