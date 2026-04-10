"use client";

import { useEffect, useRef, useState } from "react";

import Button from "./Button";
import { useI18n } from "@/i18n/client";
import { RESOURCES_NAMESPACE } from "@/i18n/config";

type ShareButtonProps = {
  title?: string;
  text?: string;
  url?: string;
  className?: string;
};

export default function ShareButton({
  title,
  text,
  url,
  className,
}: ShareButtonProps) {
  const { tx } = useI18n(RESOURCES_NAMESPACE);
  const timeoutRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const scheduleReset = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setStatus("idle");
      timeoutRef.current = null;
    }, 2200);
  };

  const handleShare = async () => {
    const shareUrl = url ?? window.location.href;
    if (!shareUrl) {
      return;
    }

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url: shareUrl });
        setStatus("idle");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setStatus("copied");
        scheduleReset();
        return;
      } catch {
        setStatus("error");
        scheduleReset();
        return;
      }
    }

    setStatus("error");
    scheduleReset();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button kind="secondary" className={className} onClick={() => void handleShare()}>
        {tx("Teilen", "de")}
      </Button>
      {status === "copied" ? (
        <p className="text-xs text-emerald-700">{tx("Link kopiert.", "de")}</p>
      ) : null}
      {status === "error" ? (
        <p className="text-xs text-rose-700">
          {tx("Teilen war hier nicht möglich.", "de")}
        </p>
      ) : null}
    </div>
  );
}