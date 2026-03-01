"use client";

import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import type { ChangeEvent, ComponentPropsWithoutRef } from "react";

import { Input } from "./form";

export type Suggestion = {
	name: string;
	account: number;
};

type AutocompleteInputProps = Omit<
	ComponentPropsWithoutRef<"input">,
	"onChange" | "onSelect"
> & {
	/** Minimum characters before fetching suggestions */
	minChars?: number;
	/** Debounce delay in ms */
	debounceMs?: number;
	/** Called when the user types (standard onChange value) */
	onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
	/** Called when the user selects a suggestion */
	onSelect?: (suggestion: Suggestion) => void;
	/** Called when the user clicks "create new". Receives the current query text. */
	onCreateNew?: (name: string) => void;
	/** Whether to show the "create new" option when no exact match is found */
	showCreateOption?: boolean;
};

export const AutocompleteInput = forwardRef<
	HTMLInputElement,
	AutocompleteInputProps
>(
	(
		{
			minChars = 2,
			debounceMs = 300,
			onChange,
			onSelect,
			onCreateNew,
			showCreateOption = false,
			...inputProps
		},
		ref,
	) => {
		const innerRef = useRef<HTMLInputElement>(null);
		useImperativeHandle(ref, () => innerRef.current!);

		const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
		const [open, setOpen] = useState(false);
		const [activeIndex, setActiveIndex] = useState(-1);
		const [loading, setLoading] = useState(false);
		const [queryText, setQueryText] = useState("");
		const [searchDone, setSearchDone] = useState(false);
		const containerRef = useRef<HTMLDivElement>(null);
		const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
		const abortRef = useRef<AbortController>(undefined);

		const fetchSuggestions = useCallback(
			async (query: string) => {
				abortRef.current?.abort();

				if (query.trim().length < minChars) {
					setSuggestions([]);
					setOpen(false);
					return;
				}

				const controller = new AbortController();
				abortRef.current = controller;

				setLoading(true);
				setSearchDone(false);
				try {
					const params = new URLSearchParams({ q: query });

					const response = await fetch(
						`/api/campai/creditors?${params.toString()}`,
						{ signal: controller.signal },
					);

					if (!response.ok) {
						setSuggestions([]);
						setOpen(false);
						setSearchDone(true);
						return;
					}

					const data = (await response.json()) as {
						suggestions?: Suggestion[];
					};

					const items = data.suggestions ?? [];
					setSuggestions(items);
					setSearchDone(true);
					const shouldShowCreate = showCreateOption && items.length === 0;
					setOpen(items.length > 0 || shouldShowCreate);
					setActiveIndex(-1);
				} catch (error) {
					if (error instanceof DOMException && error.name === "AbortError") {
						return;
					}
					setSuggestions([]);
					setOpen(false);
				} finally {
					setLoading(false);
				}
			},
			[minChars],
		);

		const handleChange = useCallback(
			(event: ChangeEvent<HTMLInputElement>) => {
				onChange?.(event);

				const value = event.target.value;
				setQueryText(value);
				clearTimeout(debounceRef.current);
				debounceRef.current = setTimeout(() => {
					fetchSuggestions(value);
				}, debounceMs);
			},
			[onChange, debounceMs, fetchSuggestions],
		);

		const selectSuggestion = useCallback(
			(suggestion: Suggestion) => {
				if (innerRef.current) {
					// Set the native input value and fire a change event
					const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
						HTMLInputElement.prototype,
						"value",
					)?.set;
					nativeInputValueSetter?.call(innerRef.current, suggestion.name);
					innerRef.current.dispatchEvent(
						new Event("input", { bubbles: true }),
					);
				}

				setSuggestions([]);
				setOpen(false);
				onSelect?.(suggestion);
			},
			[onSelect],
		);

		const hasCreateOption = showCreateOption && searchDone && suggestions.length === 0 && queryText.trim().length >= minChars;
		const totalItems = suggestions.length + (hasCreateOption ? 1 : 0);

		const handleKeyDown = useCallback(
			(event: React.KeyboardEvent<HTMLInputElement>) => {
				if (!open || totalItems === 0) {
					return;
				}

				switch (event.key) {
					case "ArrowDown":
						event.preventDefault();
						setActiveIndex((prev) =>
							prev < totalItems - 1 ? prev + 1 : 0,
						);
						break;
					case "ArrowUp":
						event.preventDefault();
						setActiveIndex((prev) =>
							prev > 0 ? prev - 1 : totalItems - 1,
						);
						break;
					case "Enter":
						if (activeIndex >= 0 && activeIndex < suggestions.length) {
							event.preventDefault();
							selectSuggestion(suggestions[activeIndex]);
						} else if (hasCreateOption && activeIndex === suggestions.length) {
							event.preventDefault();
							setOpen(false);
							onCreateNew?.(queryText.trim());
						}
						break;
					case "Escape":
						setOpen(false);
						setActiveIndex(-1);
						break;
				}
			},
			[open, totalItems, suggestions, activeIndex, selectSuggestion, hasCreateOption, onCreateNew, queryText],
		);

		// Close dropdown when clicking outside
		useEffect(() => {
			const handleClickOutside = (event: MouseEvent) => {
				if (
					containerRef.current &&
					!containerRef.current.contains(event.target as Node)
				) {
					setOpen(false);
				}
			};

			document.addEventListener("mousedown", handleClickOutside);
			return () =>
				document.removeEventListener("mousedown", handleClickOutside);
		}, []);

		// Cleanup on unmount
		useEffect(() => {
			return () => {
				clearTimeout(debounceRef.current);
				abortRef.current?.abort();
			};
		}, []);

		return (
			<div ref={containerRef} className="relative">
				<Input
					ref={innerRef}
					{...inputProps}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					onFocus={() => {
						if (suggestions.length > 0 || hasCreateOption) {
							setOpen(true);
						}
					}}
					autoComplete="off"
					role="combobox"
					aria-expanded={open}
					aria-autocomplete="list"
					aria-activedescendant={
						activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined
					}
				/>

				{loading ? (
					<div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
						<div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
					</div>
				) : null}

				{open && (suggestions.length > 0 || hasCreateOption) ? (
					<ul
						role="listbox"
						className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
					>
						{suggestions.map((suggestion, index) => (
							<li
								key={suggestion.account}
								id={`suggestion-${index}`}
								role="option"
								aria-selected={index === activeIndex}
								className={`cursor-pointer px-3 py-2 text-sm ${
									index === activeIndex
										? "bg-blue-50 text-blue-900"
										: "text-zinc-900 hover:bg-zinc-50"
								}`}
								onMouseDown={(event) => {
									event.preventDefault();
									selectSuggestion(suggestion);
								}}
							>
								<span className="font-medium">{suggestion.name}</span>
								<span className="ml-2 text-xs text-zinc-400">
									Kreditor #{suggestion.account}
								</span>
							</li>
						))}

						{hasCreateOption ? (
							<li
								id={`suggestion-${suggestions.length}`}
								role="option"
								aria-selected={activeIndex === suggestions.length}
								className={`cursor-pointer border-t border-zinc-100 px-3 py-2 text-sm ${
									activeIndex === suggestions.length
										? "bg-emerald-50 text-emerald-900"
										: "text-emerald-700 hover:bg-emerald-50"
								}`}
								onMouseDown={(event) => {
									event.preventDefault();
									setOpen(false);
									onCreateNew?.(queryText.trim());
								}}
							>
								<span className="font-medium">
									+ Neuen Kreditor anlegen:
								</span>{" "}
								<span className="italic">
									&ldquo;{queryText.trim()}&rdquo;
								</span>
							</li>
						) : null}
					</ul>
				) : null}
			</div>
		);
	},
);

AutocompleteInput.displayName = "AutocompleteInput";
