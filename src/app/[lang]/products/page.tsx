"use client";

import { useEffect, useMemo, useState } from "react";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faBoxOpen,
  faCalendarDays,
  faClock,
  faCube,
  faCubesStacked,
  faGear,
  faGraduationCap,
  faHammer,
  faLayerGroup,
  faPercent,
  faWarehouse,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

import { getCartProducts, setCartProducts, type CartProduct } from "@/lib/cart";
import Button from "../components/Button";
import PageTitle from "../components/PageTitle";

type CampaiProduct = {
  id: string;
  title: string;
  details?: string;
  unitAmount: number;
};

type ProductVisual = {
  icon: IconProp;
  accentClassName: string;
};

const defaultProductVisual: ProductVisual = {
  icon: faCube,
  accentClassName: "bg-slate-100 text-slate-600 ring-slate-200",
};

const productVisualLookup: Record<string, ProductVisual> = {
  "3d druck - arbeitszeit": {
    icon: faClock,
    accentClassName: "bg-info-soft text-info ring-info-border",
  },
  "3d druck - materialkosten (petg)": {
    icon: faCubesStacked,
    accentClassName: "bg-success-soft text-success ring-success-border",
  },
  "3d druck - nutzungsgebuhr je buildplate": {
    icon: faLayerGroup,
    accentClassName: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  },
  "cnc arbeitszeit": {
    icon: faHammer,
    accentClassName: "bg-warning-soft text-warning ring-warning-border",
  },
  "cnc maschinenlaufzeit": {
    icon: faGear,
    accentClassName: "bg-accent text-foreground/80 ring-input",
  },
  "maschinenlaufzeit cnc (ermassigt)": {
    icon: faGear,
    accentClassName: "bg-accent text-foreground/80 ring-input",
  },
  "hw materialbestellung": {
    icon: faBoxOpen,
    accentClassName: "bg-orange-100 text-orange-700 ring-orange-200",
  },
  "overhead verein": {
    icon: faPercent,
    accentClassName: "bg-destructive-soft text-destructive ring-destructive-border",
  },
  "teilnahme an cnc-workshop": {
    icon: faGraduationCap,
    accentClassName: "bg-violet-100 text-violet-700 ring-violet-200",
  },
};

const normalizeProductTitle = (title: string) =>
  title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("de-DE");

const getProductVisual = (title: string): ProductVisual => {
  const normalizedTitle = normalizeProductTitle(title);
  const exactMatch = productVisualLookup[normalizedTitle];

  if (exactMatch) {
    return exactMatch;
  }

  if (normalizedTitle.startsWith("hw lagermiete")) {
    return {
      icon: faWarehouse,
      accentClassName: "bg-stone-100 text-stone-700 ring-stone-200",
    };
  }

  if (normalizedTitle.startsWith("keinkalender")) {
    if (normalizedTitle.includes("supporter")) {
      return {
        icon: faCalendarDays,
        accentClassName: "bg-success-soft text-success ring-success-border",
      };
    }

    if (normalizedTitle.includes("reduced")) {
      return {
        icon: faCalendarDays,
        accentClassName: "bg-warning-soft text-warning ring-warning-border",
      };
    }

    return {
      icon: faCalendarDays,
      accentClassName: "bg-info-soft text-info ring-info-border",
    };
  }

  return defaultProductVisual;
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Anfrage fehlgeschlagen");
  }
  return data;
};

export default function CampaiProductsPage() {
  const [products, setProducts] = useState<CampaiProduct[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cartProducts, setCartProductsState] = useState<CartProduct[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);

  useEffect(() => {
    setCartProductsState(getCartProducts());
    setCartLoaded(true);
  }, []);

  useEffect(() => {
    if (!cartLoaded) {
      return;
    }
    setCartProducts(cartProducts);
  }, [cartProducts, cartLoaded]);

  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const data = await fetchJson<{ products: CampaiProduct[] }>(
          "/api/campai/products",
        );
        if (active) {
          setProducts(data.products ?? []);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Produkte konnten nicht geladen werden.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  const cartLookup = useMemo(() => {
    return new Map(cartProducts.map((product) => [product.id, product]));
  }, [cartProducts]);

  const handleAddProduct = (product: CampaiProduct) => {
    setCartProductsState((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: (item.quantity ?? 1) + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          title: product.title,
          details: product.details,
          unitAmount: product.unitAmount,
          quantity: 1,
        },
      ];
    });
  };

  const handleDecreaseProduct = (productId: string) => {
    setCartProductsState((prev) => {
      const existing = prev.find((item) => item.id === productId);
      if (!existing) {
        return prev;
      }
      const nextQty = (existing.quantity ?? 1) - 1;
      if (nextQty <= 0) {
        return prev.filter((item) => item.id !== productId);
      }
      return prev.map((item) =>
        item.id === productId ? { ...item, quantity: nextQty } : item,
      );
    });
  };

  return (
    <div className="min-h-screen text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <PageTitle
          title="Produkte"
          subTitle="Durchsuche Produkte und lege sie in den Warenkorb."
        />

        {errorMessage ? (
          <section className="rounded-2xl border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive">
            {errorMessage}
          </section>
        ) : null}

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Produkte</h2>
              <p className="text-sm text-muted-foreground">
                {loading ? "Lädt ..." : `${products.length} Artikel`}
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              Im Warenkorb: {cartProducts.length}
            </div>
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Produkte werden geladen ...
            </p>
          ) : products.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Keine Produkte gefunden.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {products.map((product) => {
                const inCart = cartLookup.get(product.id);
                const productVisual = getProductVisual(product.title);
                return (
                  <article
                    key={product.id}
                    className="flex h-full gap-4 rounded-2xl border border-border/60 bg-muted/60 p-4"
                  >
                    <span
                      className={`flex h-16 w-16 shrink-0 items-center justify-center self-start rounded-2xl ring-1 ${productVisual.accentClassName}`}
                      aria-hidden="true"
                    >
                      <FontAwesomeIcon
                        icon={productVisual.icon}
                        className="h-7 w-7"
                      />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/products/${product.id}`}
                          className="text-sm font-semibold text-foreground hover:underline"
                        >
                          {product.title}
                        </Link>
                        {product.details ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {product.details}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-foreground">
                          €{(product.unitAmount / 100).toFixed(2)}
                        </span>
                        <div className="flex items-center gap-2">
                          {inCart ? (
                            <span className="text-xs text-primary">
                              Im Warenkorb × {inCart.quantity ?? 1}
                            </span>
                          ) : null}
                          {inCart ? (
                            <Button
                              type="button"
                              onClick={() => handleDecreaseProduct(product.id)}
                              kind="secondary"
                              className="px-3 py-1 text-xs"
                            >
                              −
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            onClick={() => handleAddProduct(product)}
                            kind="secondary"
                            className="border-primary-border px-3 py-1 text-xs text-primary"
                          >
                            +
                          </Button>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Link
                          href={`/products/${product.id}`}
                          className="text-xs font-semibold text-muted-foreground hover:text-foreground/90"
                        >
                          Details ansehen
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
