// Mitgliedsanträge — Korrekturen des Vorstands lesen und prüfen. Es gelten
// dieselben Regeln wie im Formular; Unterschriften ändert niemand.
import {
  readRegistrationInput,
  validateRegistration,
  type RegistrationErrors,
} from "@/lib/campai-registration";

import type { ApplicationData } from "./types";

/** Nimmt nur bekannte Felder mit dem erwarteten Typ. */
export const readApplicationData = (raw: unknown): ApplicationData => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature, sepaSignature, ...data } = readRegistrationInput(raw);
  return data;
};

export const validateApplicationData = (data: ApplicationData): RegistrationErrors => {
  const errors = validateRegistration({
    ...data,
    // Die Unterschriften liegen am Antrag und werden hier nicht geprüft.
    signature: "data:image/png;base64,",
    sepaSignature: "data:image/png;base64,",
  });
  delete errors.signature;
  delete errors.sepaSignature;
  return errors;
};
