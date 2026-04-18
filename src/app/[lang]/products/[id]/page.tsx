"use client";

import { useEffect, useMemo, useState, use } from "react";
import { getCartProducts, setCartProducts, type CartProduct } from "@/lib/cart";
import Button from "../../components/Button";
import PageTitle from "../../components/PageTitle";

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
    throw new Error(data.error ?? "Anfrage fehlgeschlagen");
  }
  return data;
};

export default function CampaiProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [product, setProduct] = useState<CampaiProduct | null>(null);
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
    const loadProduct = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const data = await fetchJson<{ product: CampaiProduct }>(
          `/api/campai/products/${id}`,
        );
        if (active) {
          setProduct(data.product ?? null);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Produkt konnte nicht geladen werden.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProduct();

    return () => {
      active = false;
    };
  }, [id]);

  const cartEntry = useMemo(
    () => cartProducts.find((item) => item.id === id) ?? null,
    [cartProducts, id],
  );

  const handleAddProduct = () => {
    if (!product) {
      return;
    }
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

  const handleDecreaseProduct = () => {
    if (!product) {
      return;
    }
    setCartProductsState((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (!existing) {
        return prev;
      }
      const nextQty = (existing.quantity ?? 1) - 1;
      if (nextQty <= 0) {
        return prev.filter((item) => item.id !== product.id);
      }
      return prev.map((item) =>
        item.id === product.id ? { ...item, quantity: nextQty } : item,
      );
    });
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
        <PageTitle
          title="Produktdetails"
          subTitle="Sieh dir Details an und passe die Menge im Warenkorb an."
          backLink={{ href: "/products", label: "Zurück zu den Produkten" }}
          links={[{ href: "/", label: "Dashboard" }]}
        />

        {errorMessage ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </section>
        ) : null}

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-zinc-500">Produkt wird geladen ...</p>
          ) : !product ? (
            <p className="text-sm text-zinc-500">Produkt nicht gefunden.</p>
          ) : (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  {product.title}
                </h2>
                {product.details ? (
                  <p className="mt-2 text-sm text-zinc-600">
                    {product.details}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                    Stückpreis
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900">
                    €{(product.unitAmount / 100).toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    onClick={handleDecreaseProduct}
                    kind="secondary"
                    className="px-4 py-2 text-sm"
                    disabled={!cartEntry}
                  >
                    −
                  </Button>
                  <div className="text-sm text-zinc-600">
                    Im Warenkorb: {cartEntry?.quantity ?? 0}
                  </div>
                  <Button
                    type="button"
                    onClick={handleAddProduct}
                    kind="secondary"
                    className="border-blue-200 px-4 py-2 text-sm text-blue-700"
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
