"use client";

import {
	forwardRef,
	useCallback,
	useEffect,
	useState,
} from "react";
import type { ChangeEvent, ComponentPropsWithoutRef } from "react";

import { ComboboxInput } from "./combobox-input";

export type Suggestion = {
	name: string;
	account: number;
	paymentMethodType?: string | null;
};

type AutocompleteOption =
	| { type: "suggestion"; suggestion: Suggestion }
	| { type: "create"; name: string };

type AutocompleteInputProps = Omit<
	ComponentPropsWithoutRef<"input">,
	"onChange" | "onSelect"
> & {
	/** Minimum characters before fetching suggestions */
	minChars?: number;
	/** Debounce delay in ms */
	debounceMs?: number;
	/** Called when the user types (standard onChange value) */
	onChange?: ComponentPropsWithoutRef<"input">["onChange"];
	/** Called when the user selects a suggestion */
	onSelect?: (suggestion: Suggestion) => void;
	/** Called when the user clicks "create new". Receives the current query text. */
	onCreateNew?: (name: string) => void;
	/** Whether to show the "create new" option when no exact match is found */
	showCreateOption?: boolean;
	/** API path used for suggestions */
	apiPath?: string;
	/** Human-readable entity label used in the dropdown */
	entityLabelSingular?: string;
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
			apiPath = "/api/campai/creditors",
			entityLabelSingular = "Kreditor",
			...inputProps
		},
		ref,
	) => {
		const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
		const [loading, setLoading] = useState(false);
		const [queryText, setQueryText] = useState("");
		const [searchDone, setSearchDone] = useState(false);
		const [debouncedQuery, setDebouncedQuery] = useState("");

		useEffect(() => {
			const timeoutId = setTimeout(() => {
				setDebouncedQuery(queryText);
			}, debounceMs);

			return () => {
				clearTimeout(timeoutId);
			};
		}, [debounceMs, queryText]);

		useEffect(() => {
			const controller = new AbortController();

			if (debouncedQuery.trim().length < minChars) {
				setSuggestions([]);
				setSearchDone(false);
				setLoading(false);
				return () => {
					controller.abort();
				};
			}

			const loadSuggestions = async () => {
				setLoading(true);
				setSearchDone(false);

				try {
					const params = new URLSearchParams({ q: debouncedQuery });
					const response = await fetch(`${apiPath}?${params.toString()}`, {
						signal: controller.signal,
					});

					if (!response.ok) {
						setSuggestions([]);
						setSearchDone(true);
						return;
					}

					const data = (await response.json()) as {
						suggestions?: Suggestion[];
					};

					setSuggestions(data.suggestions ?? []);
					setSearchDone(true);
				} catch (error) {
					if (error instanceof DOMException && error.name === "AbortError") {
						return;
					}

					setSuggestions([]);
				} finally {
					setLoading(false);
				}
			};

			void loadSuggestions();

			return () => {
				controller.abort();
			};
		}, [apiPath, debouncedQuery, minChars]);

		const handleChange = useCallback(
			(event: ChangeEvent<HTMLInputElement>) => {
				onChange?.(event);
				setQueryText(event.target.value);
			},
			[onChange],
		);

		const hasCreateOption =
			showCreateOption &&
			searchDone &&
			suggestions.length === 0 &&
			queryText.trim().length >= minChars;

		const options: AutocompleteOption[] = [
			...suggestions.map((suggestion) => ({
				type: "suggestion" as const,
				suggestion,
			})),
			...(hasCreateOption
				? [{ type: "create" as const, name: queryText.trim() }]
				: []),
		];

		return (
			<ComboboxInput
				ref={ref}
				{...inputProps}
				options={options}
				loading={loading}
				onChange={handleChange}
				onSelect={(option) => {
					if (option.type === "suggestion") {
						onSelect?.(option.suggestion);
						return;
					}

					onCreateNew?.(option.name);
				}}
				getOptionKey={(option) =>
					option.type === "suggestion"
						? option.suggestion.account
						: `create-${option.name}`
				}
				getOptionInputValue={(option) =>
					option.type === "suggestion" ? option.suggestion.name : option.name
				}
				openOnFocus
				openWhenOptionsChange
				renderOption={(option, { active }) =>
					option.type === "suggestion" ? (
						<div
							className={`cursor-pointer px-3 py-2 text-sm ${
								active
									? "bg-blue-50 text-blue-900"
									: "text-zinc-900 hover:bg-zinc-50"
							}`}
						>
							<span className="font-medium">{option.suggestion.name}</span>
							<span className="ml-2 text-xs text-zinc-400">
								{entityLabelSingular} #{option.suggestion.account}
							</span>
						</div>
					) : (
						<div
							className={`cursor-pointer border-t border-zinc-100 px-3 py-2 text-sm ${
								active
									? "bg-emerald-50 text-emerald-900"
									: "text-emerald-700 hover:bg-emerald-50"
							}`}
						>
							<span className="font-medium">
								+ Neuen {entityLabelSingular} anlegen:
							</span>{" "}
							<span className="italic">&ldquo;{option.name}&rdquo;</span>
						</div>
					)
				}
				/>
		);
	},
);

AutocompleteInput.displayName = "AutocompleteInput";
