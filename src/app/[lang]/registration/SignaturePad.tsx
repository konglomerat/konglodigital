"use client";

// Unterschriftenfeld: mit Maus, Finger oder Stift auf ein Blatt zeichnen.
// Der Wert ist ein PNG als Data-URL mit durchsichtigem Grund, oder `null`,
// solange nichts gezeichnet ist. Vor dem Absenden legt `flattenOnWhite` es
// auf Weiß, wie Campais eigenes Feld.
import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import Button from "@/components/knglmrt/Button";

const HEIGHT = 130;
const STROKE = "#111111";

type SignaturePadProps = {
  title: string;
  /** Ort und Datum, rechts neben dem Titel. */
  place: string;
  text: string;
  /** Wer unterschreibt — steht unter der Linie. */
  signer: string;
  value: string | null;
  onChange: (value: string | null) => void;
};

/** Legt eine Unterschrift mit durchsichtigem Grund auf weißes Papier. */
export const flattenOnWhite = (dataUrl: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Kein Canvas."));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Unterschrift nicht lesbar."));
    image.src = dataUrl;
  });

export default function SignaturePad({
  title,
  place,
  text,
  signer,
  value,
  onChange,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastWidth = useRef(0);
  // Der Aufrufer reicht bei jedem Rendern eine neue Funktion herein. Hinge
  // die Leinwand-Einrichtung an ihr, liefe sie nach jedem Strich erneut und
  // leerte das Blatt — deshalb steht die jeweils aktuelle hier.
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  }, [onChange, value]);

  const prepare = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return null;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = window.devicePixelRatio || 1;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = STROKE;
    return context;
  }, []);

  // Die Leinwand richtet sich nach der Breite ihres Rahmens; ändern lässt
  // sie sich nur durch Leeren. Eine schon vorhandene Unterschrift kommt
  // danach in Originalgröße zurück aufs Blatt — nach „Zurück" und wieder
  // „Weiter" ebenso wie nach einem Scrollbalken oder gedrehten Telefon.
  // Gestreckt wird sie nie; wird das Blatt schmaler, bleibt der Wert
  // trotzdem die ganze Unterschrift, bis jemand weiterzeichnet.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const width = canvas.parentElement?.clientWidth ?? 0;
      if (!width || width === lastWidth.current) return;
      lastWidth.current = width;
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(HEIGHT * scale);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${HEIGHT}px`;
      const context = prepare();
      const stored = valueRef.current;
      if (!stored || !context) return;
      const image = new Image();
      image.onload = () =>
        context.drawImage(
          image,
          0,
          0,
          image.naturalWidth / scale,
          image.naturalHeight / scale,
        );
      image.src = stored;
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [prepare]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
    // Ein Tipp ohne Bewegung soll einen Punkt hinterlassen.
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const finishStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChangeRef.current(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    prepare();
    onChangeRef.current(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="knglmrt-label text-muted-foreground">
          {title}
        </span>
        <span className="font-num text-[14px] text-muted-foreground">
          {place}
        </span>
      </div>
      <p className="text-[15px] leading-[21px] text-pretty">{text}</p>
      <div className="relative bg-knglmrt-paper-grey shadow-[inset_0_0_0_0.5px_var(--knglmrt-dark-30)]">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${title} — Zeichenfläche`}
          className="block cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
        />
        <div className="pointer-events-none absolute inset-x-4 bottom-[30px] border-t-[0.5px] border-foreground" />
        <span className="pointer-events-none absolute bottom-2.5 left-4 text-[14px] text-muted-foreground">
          {signer}
        </span>
        <div className="absolute top-2 right-2.5">
          <Button
            kind="quiet"
            size="chip"
            onClick={clear}
            disabled={!value}
          >
            Löschen
          </Button>
        </div>
      </div>
    </div>
  );
}
