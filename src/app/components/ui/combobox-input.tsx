"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  ComponentPropsWithoutRef,
  ForwardedRef,
  KeyboardEvent,
  Key,
  ReactNode,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

import { Input } from "./form";

type ComboboxInputProps<T> = Omit<
  ComponentPropsWithoutRef<"input">,
  "onChange" | "onSelect"
> & {
  options: T[];
  loading?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelect: (option: T) => void;
  renderOption: (option: T, state: { active: boolean }) => ReactNode;
  getOptionKey: (option: T, index: number) => Key;
  getOptionInputValue?: (option: T) => string;
  onRequestOpen?: () => void | Promise<void>;
  showToggleButton?: boolean;
  toggleAriaLabel?: string;
  dropdownClassName?: string;
  openOnFocus?: boolean;
  openWhenOptionsChange?: boolean;
};

const setNativeInputValue = (element: HTMLInputElement, value: string) => {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  nativeInputValueSetter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
};

function ComboboxInputInner<T>(
  {
    options,
    loading = false,
    onChange,
    onSelect,
    renderOption,
    getOptionKey,
    getOptionInputValue,
    onRequestOpen,
    showToggleButton = false,
    toggleAriaLabel = "Liste öffnen",
    dropdownClassName,
    openOnFocus = false,
    openWhenOptionsChange = false,
    className,
    ...inputProps
  }: ComboboxInputProps<T>,
  ref: ForwardedRef<HTMLInputElement>,
) {
  const innerRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => innerRef.current!);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasFocus, setHasFocus] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const requestOpen = useCallback(() => {
    void onRequestOpen?.();
    setOpen(true);
  }, [onRequestOpen]);

  const selectOption = useCallback(
    (option: T) => {
      if (innerRef.current && getOptionInputValue) {
        setNativeInputValue(innerRef.current, getOptionInputValue(option));
      }

      closeDropdown();
      onSelect(option);
    },
    [closeDropdown, getOptionInputValue, onSelect],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange?.(event);
    },
    [onChange],
  );

  const handleToggleOpen = useCallback(() => {
    if (open) {
      closeDropdown();
      return;
    }

    requestOpen();
  }, [closeDropdown, open, requestOpen]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case "ArrowDown":
          if (!open) {
            event.preventDefault();
            requestOpen();
            return;
          }

          if (options.length === 0) {
            return;
          }

          event.preventDefault();
          setActiveIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          if (!open || options.length === 0) {
            return;
          }

          event.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
          break;
        case "Enter":
          if (!open || options.length === 0) {
            return;
          }

          if (activeIndex >= 0 && activeIndex < options.length) {
            event.preventDefault();
            selectOption(options[activeIndex]);
          }
          break;
        case "Escape":
          closeDropdown();
          break;
      }
    },
    [activeIndex, closeDropdown, open, options, requestOpen, selectOption],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeDropdown();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [closeDropdown]);

  useEffect(() => {
    if (!loading && open && options.length === 0) {
      closeDropdown();
    }
  }, [closeDropdown, loading, open, options.length]);

  useEffect(() => {
    if (openWhenOptionsChange && hasFocus && options.length > 0) {
      setOpen(true);
    }
  }, [hasFocus, openWhenOptionsChange, options.length]);

  useEffect(() => {
    if (activeIndex >= options.length) {
      setActiveIndex(-1);
    }
  }, [activeIndex, options.length]);

  const resolvedInputClassName = [
    showToggleButton || loading ? "pr-10" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={innerRef}
        {...inputProps}
        className={resolvedInputClassName}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setHasFocus(true);
          if (openOnFocus && (options.length > 0 || onRequestOpen)) {
            requestOpen();
          }
        }}
        onBlur={(event) => {
          setHasFocus(false);

          if (
            containerRef.current &&
            event.relatedTarget instanceof Node &&
            containerRef.current.contains(event.relatedTarget)
          ) {
            return;
          }

          closeDropdown();
        }}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `combobox-option-${activeIndex}` : undefined
        }
      />

      {loading ? (
        <div className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
        </div>
      ) : null}

      {showToggleButton ? (
        <button
          type="button"
          className="absolute inset-y-1 right-1 inline-flex w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
          aria-label={toggleAriaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={handleToggleOpen}
        >
          <FontAwesomeIcon
            icon={faChevronDown}
            className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`}
          />
        </button>
      ) : null}

      {open && options.length > 0 ? (
        <ul
          role="listbox"
          className={
            dropdownClassName ??
            "absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
          }
        >
          {options.map((option, index) => (
            <li
              key={getOptionKey(option, index)}
              id={`combobox-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
            >
              {renderOption(option, { active: index === activeIndex })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const ForwardedComboboxInput = forwardRef(ComboboxInputInner);

ForwardedComboboxInput.displayName = "ComboboxInput";

export const ComboboxInput = ForwardedComboboxInput as <T>(
  props: ComboboxInputProps<T> & { ref?: ForwardedRef<HTMLInputElement> },
) => ReactNode;
