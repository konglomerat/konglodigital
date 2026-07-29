import "server-only";

import nodemailer from "nodemailer";

type SmtpConfiguration = {
  host: string;
  port: number;
  user: string;
  pass: string;
  senderName: string;
};

type SendSmtpMailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export class SmtpConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpConfigurationError";
  }
}

const getSmtpConfiguration = (): SmtpConfiguration => {
  const host = process.env.SMTP_HOST?.trim();
  const rawPort = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const missingVariables = [
    !host ? "SMTP_HOST" : null,
    !rawPort ? "SMTP_PORT" : null,
    !user ? "SMTP_USER" : null,
    !pass ? "SMTP_PASS" : null,
  ].filter((name): name is string => Boolean(name));

  if (!host || !rawPort || !user || !pass) {
    throw new SmtpConfigurationError(
      `SMTP ist nicht konfiguriert. Es fehlen: ${missingVariables.join(", ")}.`,
    );
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new SmtpConfigurationError(
      "SMTP_PORT muss eine ganze Zahl zwischen 1 und 65535 sein.",
    );
  }

  return {
    host,
    port,
    user,
    pass,
    senderName: process.env.SMTP_SENDER_NAME?.trim() || user,
  };
};

export const sendSmtpMail = async ({
  to,
  subject,
  html,
  text,
  replyTo,
}: SendSmtpMailInput) => {
  const config = getSmtpConfiguration();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port === 587,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      minVersion: "TLSv1.2",
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  return transporter.sendMail({
    from: {
      name: config.senderName,
      address: config.user,
    },
    to,
    subject,
    html,
    text,
    replyTo,
  });
};
