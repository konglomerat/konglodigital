import { forwardRef } from "react";
import type {
  ComponentPropsWithoutRef,
  HTMLAttributes,
  ReactNode,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

function cn(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

type FormSectionProps = {
  title: string;
  icon?: IconProp;
  description?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function FormSection({
  title,
  icon,
  description,
  children,
  className,
  ...props
}: FormSectionProps) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-border bg-card p-6 shadow-sm",
        className,
      )}
      {...props}
    >
      <header className="mb-4 space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          {icon ? (
            <FontAwesomeIcon icon={icon} className="h-4 w-4 text-primary" />
          ) : null}
          <span>{title}</span>
        </h2>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

type FormFieldProps = {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
} & HTMLAttributes<HTMLDivElement>;

export function FormField({
  label,
  required = false,
  error,
  hint,
  children,
  className,
  labelClassName,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      <label
        className={cn(
          "block text-xs font-semibold uppercase tracking-wide text-muted-foreground",
          labelClassName,
        )}
      >
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

type InputProps = ComponentPropsWithoutRef<"input">;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none",
          className,
        )}
        autoComplete={props.autoComplete ?? "off"}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

type TextareaProps = ComponentPropsWithoutRef<"textarea">;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-24 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none",
          className,
        )}
        autoComplete={props.autoComplete ?? "off"}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";

type SelectProps = ComponentPropsWithoutRef<"select">;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none",
          className,
        )}
        autoComplete={props.autoComplete ?? "off"}
        {...props}
      >
        {children}
      </select>
    );
  },
);

Select.displayName = "Select";

type CheckboxProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  label: string;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, ...props }, ref) => {
    return (
      <label className="inline-flex items-center gap-2 text-sm text-foreground select-none">
        <input
          ref={ref}
          type="checkbox"
          className={cn(
            "h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring/30",
            className,
          )}
          autoComplete={props.autoComplete ?? "off"}
          {...props}
        />
        <span>{label}</span>
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
