// Die Bestätigung an die Person, die Feedback geschickt hat.
import "server-only";

import { sendSmtpMail } from "@/lib/smtp-mail";

import {
  FEEDBACK_DISCUSSIONS_URL,
  type FeedbackLanguage,
  type FeedbackSubmission,
} from "./feedback";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const textToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("\n");

const confirmationText = (
  language: FeedbackLanguage,
  submission: FeedbackSubmission,
  url: string,
) => {
  const isIdea = submission.type === "feature";

  if (language === "en") {
    return {
      subject: `Thanks for your feedback: ${submission.title}`,
      text: [
        `Hi ${submission.name},`,
        "thanks for your feedback, it reached us safely!",
        `You can follow along here:\n${url}`,
        isIdea
          ? `Browse more ideas and vote for your favourites:\n${FEEDBACK_DISCUSSIONS_URL}`
          : null,
        "Your Konglomerat team",
      ],
    };
  }

  return {
    subject: `Danke für dein Feedback: ${submission.title}`,
    text: [
      `Hallo ${submission.name},`,
      "danke für dein Feedback, es ist gut bei uns angekommen!",
      `Hier kannst du verfolgen, wie es weitergeht:\n${url}`,
      isIdea
        ? `Schau dir weitere Ideen an und stimme für deine Favoriten ab:\n${FEEDBACK_DISCUSSIONS_URL}`
        : null,
      "Dein Konglomerat-Team",
    ],
  };
};

export const mailFeedbackConfirmation = ({
  email,
  submission,
  url,
}: {
  email: string;
  submission: FeedbackSubmission;
  url: string;
}) => {
  const { subject, text } = confirmationText(
    submission.context.language,
    submission,
    url,
  );
  const body = text.filter(Boolean).join("\n\n");

  return sendSmtpMail({
    to: email,
    subject,
    text: body,
    html: textToHtml(body),
  });
};
