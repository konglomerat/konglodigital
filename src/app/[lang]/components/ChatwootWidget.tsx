"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    chatwootSettings?: {
      locale?: string;
    };
    chatwootSDK?: {
      run: (config: { websiteToken: string; baseUrl: string }) => void;
    };
  }
}

const CHATWOOT_BASE_URL = "https://support.konglomerat.org";
const CHATWOOT_WEBSITE_TOKEN = "qGcX2PgF3rKkxN4Zeahqb9Tu";
const CHATWOOT_SCRIPT_ID = "chatwoot-sdk-script";

export default function ChatwootWidget() {
  useEffect(() => {
    window.chatwootSettings = {
      ...(window.chatwootSettings ?? {}),
      locale: "de",
    };

    const runChatwoot = () => {
      if (!window.chatwootSDK) {
        return;
      }

      window.chatwootSDK.run({
        websiteToken: CHATWOOT_WEBSITE_TOKEN,
        baseUrl: CHATWOOT_BASE_URL,
      });
    };

    const existingScript = document.getElementById(CHATWOOT_SCRIPT_ID);

    if (existingScript) {
      runChatwoot();
      return;
    }

    const script = document.createElement("script");
    script.id = CHATWOOT_SCRIPT_ID;
    script.src = `${CHATWOOT_BASE_URL}/packs/js/sdk.js`;
    script.async = true;
    script.onload = runChatwoot;

    const firstScript = document.getElementsByTagName("script")[0];

    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }, []);

  return null;
}
