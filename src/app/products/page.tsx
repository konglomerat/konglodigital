"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { getCartProducts, setCartProducts, type CartProduct } from "@/lib/cart";

type CampaiProduct = {
  id: string;
  title: string;
  details?: string;
  unitAmount: number;
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
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
              : "Unable to load Campai products.",
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
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Campai products
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Browse products and add them to the checkout cart.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600"
          >
            Back to dashboard
          </Link>
        </header>

        {errorMessage ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </section>
        ) : null}

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Products</h2>
              <p className="text-sm text-zinc-500">
                {loading ? "Loading..." : `${products.length} items`}
              </p>
            </div>
            <div className="text-xs text-zinc-500">
              In cart: {cartProducts.length}
            </div>
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">Loading products...</p>
          ) : products.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No products found.</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {products.map((product) => {
                const inCart = cartLookup.get(product.id);
                return (
                  <article
                    key={product.id}
                    className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4"
                  >
                    <div>
                      <Link
                        href={`/products/${product.id}`}
                        className="text-sm font-semibold text-zinc-900 hover:underline"
                      >
                        {product.title}
                      </Link>
                      {product.details ? (
                        <p className="mt-2 text-xs text-zinc-500">
                          {product.details}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-zinc-900">
                        €{(product.unitAmount / 100).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-2">
                        {inCart ? (
                          <span className="text-xs text-blue-600">
                            In cart × {inCart.quantity ?? 1}
                          </span>
                        ) : null}
                        {inCart ? (
                          <button
                            type="button"
                            onClick={() => handleDecreaseProduct(product.id)}
                            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600"
                          >
                            −
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleAddProduct(product)}
                          className="rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Link
                        href={`/products/${product.id}`}
                        className="text-xs font-semibold text-zinc-500 hover:text-zinc-800"
                      >
                        View details
                      </Link>
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
