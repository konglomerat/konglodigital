"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { getCartProducts, setCartProducts, type CartProduct } from "@/lib/cart";

type MembershipPlanId = "full" | "quarter" | "none";

type MembershipPlan = {
  id: MembershipPlanId;
  title: string;
  description: string;
  priceLabel: string;
};

const membershipPlans: MembershipPlan[] = [
  {
    id: "full",
    title: "Uneingeschränkter Zugang",
    description:
      "uneingeschränkter Zugang zu allen Werkstattbereichen + Nutzung von Geräten und Maschinen",
    priceLabel: "30 €",
  },
  {
    id: "quarter",
    title: "15 Tage im Quartal",
    description:
      "Zugang an 15 verschiedenen Tagen innerhalb eines Quartals + Nutzung von Geräten und Maschinen",
    priceLabel: "15 €",
  },
  {
    id: "none",
    title: "No Zugangskarte",
    description: "Kein Monatsbeitrag ausgewählt",
    priceLabel: "—",
  },
];

const tenVisitCard = {
  id: "ten-visit-card",
  title: "10er Karte",
  unitAmount: 5000,
  details:
    "Zugang an 10 Tagen innerhalb von 12 Monaten + Nutzung von Geräten und Maschinen",
};

export default function MonatsbeitragPage() {
  const [selectedPlan, setSelectedPlan] = useState<MembershipPlanId>("full");
  const [cartProducts, setCartProductsState] = useState<CartProduct[]>(() =>
    getCartProducts(),
  );

  useEffect(() => {
    setCartProducts(cartProducts);
  }, [cartProducts]);

  const cartLookup = useMemo(() => {
    return new Map(cartProducts.map((product) => [product.id, product]));
  }, [cartProducts]);

  const handleAddTenVisitCard = () => {
    setCartProductsState((prev) => {
      const existing = prev.find((item) => item.id === tenVisitCard.id);
      if (existing) {
        return prev.map((item) =>
          item.id === tenVisitCard.id
            ? { ...item, quantity: (item.quantity ?? 1) + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          id: tenVisitCard.id,
          title: tenVisitCard.title,
          details: tenVisitCard.details,
          unitAmount: tenVisitCard.unitAmount,
          quantity: 1,
        },
      ];
    });
  };

  const handleDecreaseTenVisitCard = () => {
    setCartProductsState((prev) => {
      const existing = prev.find((item) => item.id === tenVisitCard.id);
      if (!existing) {
        return prev;
      }
      const nextQty = (existing.quantity ?? 1) - 1;
      if (nextQty <= 0) {
        return prev.filter((item) => item.id !== tenVisitCard.id);
      }
      return prev.map((item) =>
        item.id === tenVisitCard.id ? { ...item, quantity: nextQty } : item,
      );
    });
  };

  const selectedPlanInfo = membershipPlans.find(
    (plan) => plan.id === selectedPlan,
  );
  const tenVisitInCart = cartLookup.get(tenVisitCard.id);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Monatsbeitrag & Zugangskarte
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Wähle deinen Monatsbeitrag und buche eine 10er Karte.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600"
          >
            Back to dashboard
          </Link>
        </header>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Monatsbeitrag wählen
              </h2>
              <p className="text-sm text-zinc-500">
                Aktuelle Auswahl: {selectedPlanInfo?.title ?? "—"}
              </p>
            </div>
            <div className="text-xs text-zinc-500">
              Monatlich: {selectedPlanInfo?.priceLabel ?? "—"}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {membershipPlans.map((plan) => (
              <label
                key={plan.id}
                className={`flex h-full cursor-pointer flex-col justify-between gap-4 rounded-2xl border p-4 text-sm transition ${
                  selectedPlan === plan.id
                    ? "border-blue-200 bg-blue-50"
                    : "border-zinc-100 bg-zinc-50/60"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {plan.title}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {plan.description}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-zinc-900">
                      {plan.priceLabel}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    {selectedPlan === plan.id ? "Ausgewählt" : "Auswählen"}
                  </span>
                  <input
                    type="radio"
                    name="membership-plan"
                    value={plan.id}
                    checked={selectedPlan === plan.id}
                    onChange={() => setSelectedPlan(plan.id)}
                    className="h-4 w-4 accent-blue-600"
                  />
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                10er Karte
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                {tenVisitCard.details}
              </p>
            </div>
            <div className="text-xs text-zinc-500">50 €</div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">
              {tenVisitInCart
                ? `Im Warenkorb × ${tenVisitInCart.quantity ?? 1}`
                : "Noch nicht im Warenkorb"}
            </div>
            <div className="flex items-center gap-2">
              {tenVisitInCart ? (
                <button
                  type="button"
                  onClick={handleDecreaseTenVisitCard}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600"
                >
                  −
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleAddTenVisitCard}
                className="rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700"
              >
                In den Warenkorb
              </button>
              <Link
                href="/checkout"
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600"
              >
                Zum Checkout
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
