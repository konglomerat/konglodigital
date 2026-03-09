"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ComponentPropsWithoutRef } from "react";

import { ComboboxInput } from "./combobox-input";

export type ProductSuggestion = {
  id: string;
  name: string;
  description?: string;
  unit?: string;
  unitAmount?: number;
  taxCode?: "0" | "7" | "19" | null;
  costCenter1?: string | null;
};

type ProductAutocompleteInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "onChange" | "onSelect"
> & {
  onChange?: ComponentPropsWithoutRef<"input">["onChange"];
  onSelect?: (suggestion: ProductSuggestion) => void;
  apiPath?: string;
};

const formatAmount = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value / 100);
};

type ProductListResponse = {
  products?: Array<{
    id: string;
    title: string;
    details?: string;
    unit?: string;
    unitAmount?: number;
    taxCode?: "0" | "7" | "19" | null;
    costCenter1?: string | null;
  }>;
};

export const ProductAutocompleteInput = forwardRef<
  HTMLInputElement,
  ProductAutocompleteInputProps
>(
  (
    {
      onChange,
      onSelect,
      apiPath = "/api/campai/products",
      ...inputProps
    },
    ref,
  ) => {
    const [loading, setLoading] = useState(false);
    const [productsLoaded, setProductsLoaded] = useState(false);
    const [allProducts, setAllProducts] = useState<ProductSuggestion[]>([]);
    const abortRef = useRef<AbortController | null>(null);

    const loadProducts = useCallback(async () => {
      if (productsLoaded) {
        return;
      }

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "100" });
        const response = await fetch(`${apiPath}?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setAllProducts([]);
          setProductsLoaded(true);
          return;
        }

        const data = (await response.json()) as ProductListResponse;
        const items = (data.products ?? []).map((product) => ({
          id: product.id,
          name: product.title,
          description: product.details,
          unit: product.unit,
          unitAmount: product.unitAmount,
          taxCode: product.taxCode ?? null,
          costCenter1: product.costCenter1 ?? null,
        }));

        setAllProducts(items);
        setProductsLoaded(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setAllProducts([]);
        setProductsLoaded(true);
      } finally {
        setLoading(false);
      }
    }, [apiPath, productsLoaded]);

    useEffect(() => {
      return () => {
        abortRef.current?.abort();
      };
    }, []);

    return (
      <ComboboxInput
        ref={ref}
        {...inputProps}
        options={allProducts}
        loading={loading}
        onChange={onChange}
        onSelect={(suggestion) => {
          onSelect?.(suggestion);
        }}
        onRequestOpen={loadProducts}
        getOptionKey={(option) => option.id}
        getOptionInputValue={(option) => option.name}
        showToggleButton
        toggleAriaLabel="Produktliste öffnen"
        dropdownClassName="absolute left-0 top-full z-50 mt-1 max-h-56 w-[min(90vw,36rem)] min-w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
        renderOption={(suggestion, { active }) => {
          const amount = formatAmount(suggestion.unitAmount);

          return (
            <div
              className={`cursor-pointer px-3 py-2 text-sm ${
                active
                  ? "bg-blue-50 text-blue-900"
                  : "text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words font-medium leading-5">
                    {suggestion.name}
                  </p>
                  {suggestion.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                      {suggestion.description}
                    </p>
                  ) : null}
                </div>
                {amount ? (
                  <span className="shrink-0 text-xs font-semibold text-zinc-600">
                    {amount}
                  </span>
                ) : null}
              </div>
            </div>
          );
        }}
      />
    );
  },
);

ProductAutocompleteInput.displayName = "ProductAutocompleteInput";
