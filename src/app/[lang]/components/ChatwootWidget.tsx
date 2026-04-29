"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Button from "./Button";

declare global {
  interface Window {
    chatwootSettings?: {
      locale?: string;
      hideMessageBubble?: boolean;
    };
    chatwootSDK?: {
      run: (config: { websiteToken: string; baseUrl: string }) => void;
    };
    $chatwoot?: {
      hasLoaded?: boolean;
      isOpen?: boolean;
      setLocale?: (locale: string) => void;
      toggle: (state?: "open" | "close") => void;
      toggleBubbleVisibility: (state: "show" | "hide") => void;
    };
  }
}

const CHATWOOT_BASE_URL = "https://support.konglomerat.org";
const CHATWOOT_WEBSITE_TOKEN = "qGcX2PgF3rKkxN4Zeahqb9Tu";
const CHATWOOT_SCRIPT_ID = "chatwoot-sdk-script";

type ChatwootWidgetProps = {
  locale: string;
};

const buttonLabelByLocale: Record<string, string> = {
  de: "Chat",
  en: "Chat",
};

export default function ChatwootWidget({ locale }: ChatwootWidgetProps) {
  const pathname = usePathname();
  const pendingOpenRef = useRef(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const normalizedPathname = pathname?.replace(/\/+$/, "") ?? "";
  const shouldHideButton = normalizedPathname.endsWith("/resources/batch");

  useEffect(() => {
    window.chatwootSettings = {
      ...(window.chatwootSettings ?? {}),
      locale,
      hideMessageBubble: true,
    };

    const syncWidgetState = () => {
      const widget = window.$chatwoot;

      if (!widget) {
        return;
      }

      widget.setLocale?.(locale);
      widget.toggleBubbleVisibility("hide");
      setIsChatOpen(Boolean(widget.isOpen));

      if (widget.hasLoaded && pendingOpenRef.current) {
        pendingOpenRef.current = false;
        widget.toggle("open");
        setIsChatOpen(true);
      }
    };

    const ensureChatwoot = () => {
      if (!window.chatwootSDK) {
        return;
      }

      window.chatwootSDK.run({
        websiteToken: CHATWOOT_WEBSITE_TOKEN,
        baseUrl: CHATWOOT_BASE_URL,
      });

      syncWidgetState();
    };

    const handleReady = () => {
      syncWidgetState();
    };

    const handleOpened = () => {
      setIsChatOpen(true);
    };

    const handleClosed = () => {
      setIsChatOpen(false);
    };

    window.addEventListener("chatwoot:ready", handleReady);
    window.addEventListener("chatwoot:opened", handleOpened);
    window.addEventListener("chatwoot:closed", handleClosed);

    const existingScript = document.getElementById(CHATWOOT_SCRIPT_ID);

    if (existingScript) {
      ensureChatwoot();
    } else {
      const script = document.createElement("script");
      script.id = CHATWOOT_SCRIPT_ID;
      script.src = `${CHATWOOT_BASE_URL}/packs/js/sdk.js`;
      script.async = true;
      script.onload = ensureChatwoot;

      const firstScript = document.getElementsByTagName("script")[0];

      if (firstScript?.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        document.head.appendChild(script);
      }
    }

    return () => {
      window.removeEventListener("chatwoot:ready", handleReady);
      window.removeEventListener("chatwoot:opened", handleOpened);
      window.removeEventListener("chatwoot:closed", handleClosed);
    };
  }, [locale]);

  const handleOpenChat = () => {
    const widget = window.$chatwoot;

    if (!widget?.hasLoaded) {
      pendingOpenRef.current = true;
      return;
    }

    widget.toggle("open");
    setIsChatOpen(true);
  };

  if (isChatOpen || shouldHideButton) {
    return null;
  }

  return (
    <Button
      type="button"
      kind="primary"
      size="medium"
      className="fixed bottom-4 right-4 z-50 rounded-full px-5 py-3 shadow-lg shadow-primary/20 md:bottom-6 md:right-6"
      aria-label={buttonLabelByLocale[locale] ?? buttonLabelByLocale.de}
      onClick={handleOpenChat}
    >
      {buttonLabelByLocale[locale] ?? buttonLabelByLocale.de}
    </Button>
  );
}
