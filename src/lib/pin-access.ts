export const PIN_COOKIE_NAME = "viewer_pin_verified";
export const PIN_COOKIE_VALUE = "1";
export const PIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

export const isSafeMethod = (method: string) => {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
};

export const isValidViewerPin = (pin: string, configuredPin: string | undefined) => {
  if (!configuredPin) {
    return false;
  }

  return /^\d{4}$/.test(pin) && pin === configuredPin;
};
