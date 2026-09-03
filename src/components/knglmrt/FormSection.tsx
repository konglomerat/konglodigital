// Ein Abschnitt im Formular: Überschrift, optionale Einordnung, darunter die
// Felder. Die Kontur hält ihn zusammen — kein Schatten, keine Rundung, keine
// getönte Fläche (die ist den Karten vorbehalten). Sie läuft braun statt
// schwarz (--hairline-section): der Abschnitt rahmt eine Gruppe, er ist selbst
// kein Bedienelement.
//
// Ohne `title` bleibt der Kopf weg — für Abschnitte, die ihre Überschrift
// selbst mitbringen oder gar keine brauchen. Die Kontur ist dieselbe, damit
// solche Panels nicht in eigenen Rahmenstilen auseinanderlaufen.
import type { HTMLAttributes, ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

import { cn } from "@/components/knglmrt/FieldShell";

export type FormSectionProps = {
  title?: string;
  icon?: IconProp;
  description?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export default function FormSection({
  title,
  icon,
  description,
  children,
  className,
  ...rest
}: FormSectionProps) {
  return (
    <section className={cn("knglmrt-border-section bg-card p-6", className)} {...rest}>
      {title || description ? (
        <header className="mb-4 space-y-1">
          {title ? (
            <h2 className="knglmrt-card-title flex items-center gap-2 text-foreground">
              {icon ? (
                <FontAwesomeIcon icon={icon} className="h-4 w-4 text-primary" />
              ) : null}
              <span>{title}</span>
            </h2>
          ) : null}
          {description ? (
            <p className="text-muted-foreground">{description}</p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
