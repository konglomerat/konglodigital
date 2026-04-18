"use client";

import { useEffect, useMemo, useState } from "react";
import { getCartProducts, setCartProducts, type CartProduct } from "@/lib/cart";
import Button from "../components/Button";
import PageTitle from "../components/PageTitle";

type AccessCardPlanId = "none" | "quarter" | "full";

type AccessCardPlan = {
  id: AccessCardPlanId;
  title: string;
  description: string;
  priceLabel: string;
};

type AccessCardOptionId = "none" | "subscription" | "ten-visit";
type SubscriptionPlanId = Exclude<AccessCardPlanId, "none">;

type SubmittedChange = {
  requestedPlan: AccessCardPlanId;
  requestedAt: string;
};

const ACCESS_CARD_STORAGE_KEY = "zugangskarte-current-plan";
const ACCESS_CARD_CHANGE_STORAGE_KEY = "zugangskarte-submitted-change";

const accessCardPlans: Array<AccessCardPlan & { id: SubscriptionPlanId }> = [
  {
    id: "quarter",
    title: "Abokarte – 15 Zugänge im Quartal",
    description:
      "15 € pro Monat. Für Mitglieder, die bis zu 15 Zugänge pro Quartal benötigen.",
    priceLabel: "15 € / Monat",
  },
  {
    id: "full",
    title: "Abokarte – 24/7 Zugang",
    description:
      "30 € pro Monat. Rund-um-die-Uhr-Zugang zu den Werkstattbereichen.",
    priceLabel: "30 € / Monat",
  },
];

const accessCardOptions = [
  {
    id: "none",
    title: "Keine Zugangskarte",
    description: "Kein laufendes Abo",
  },
  {
    id: "subscription",
    title: "Abokarte",
    description: "Monatliche Zahlung",
  },
  {
    id: "ten-visit",
    title: "10er Karte",
    description: "Einmalzahlung",
  },
] as const satisfies ReadonlyArray<{
  id: AccessCardOptionId;
  title: string;
  description: string;
}>;

const tenVisitCard = {
  id: "ten-visit-card",
  title: "10er Karte",
  unitAmount: 5000,
  details:
    "Einmalzahlung für 10 Zugänge innerhalb von 12 Monaten.",
};

const formatPlanName = (planId: AccessCardPlanId) => {
  return accessCardPlans.find((plan) => plan.id === planId)?.title ?? "—";
};

export default function MonatsbeitragPage() {
  const [currentPlan, setCurrentPlan] = useState<AccessCardPlanId>("none");
  const [draftPlan, setDraftPlan] = useState<AccessCardPlanId>("none");
  const [selectedOption, setSelectedOption] = useState<AccessCardOptionId>("none");
  const [subscriptionPlanDraft, setSubscriptionPlanDraft] =
    useState<SubscriptionPlanId>("quarter");
  const [submittedChange, setSubmittedChange] = useState<SubmittedChange | null>(
    null,
  );
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [cartProducts, setCartProductsState] = useState<CartProduct[]>(() =>
    getCartProducts(),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedPlan = window.localStorage.getItem(ACCESS_CARD_STORAGE_KEY);
    if (
      storedPlan === "none" ||
      storedPlan === "quarter" ||
      storedPlan === "full"
    ) {
      setCurrentPlan(storedPlan);
      setDraftPlan(storedPlan);
      if (storedPlan === "quarter" || storedPlan === "full") {
        setSubscriptionPlanDraft(storedPlan);
        setSelectedOption("subscription");
      } else {
        setSelectedOption("none");
      }
    }

    const storedChange = window.localStorage.getItem(
      ACCESS_CARD_CHANGE_STORAGE_KEY,
    );
    if (storedChange) {
      try {
        const parsed = JSON.parse(storedChange) as SubmittedChange;
        if (
          parsed.requestedPlan === "none" ||
          parsed.requestedPlan === "quarter" ||
          parsed.requestedPlan === "full"
        ) {
          setSubmittedChange(parsed);
          setDraftPlan(parsed.requestedPlan);
          if (
            parsed.requestedPlan === "quarter" ||
            parsed.requestedPlan === "full"
          ) {
            setSubscriptionPlanDraft(parsed.requestedPlan);
            setSelectedOption("subscription");
          } else {
            setSelectedOption("none");
          }
        }
      } catch {
        window.localStorage.removeItem(ACCESS_CARD_CHANGE_STORAGE_KEY);
      }
    }
  }, []);

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

  const currentPlanInfo = accessCardPlans.find(
    (plan) => plan.id === currentPlan,
  );
  const draftPlanInfo = accessCardPlans.find((plan) => plan.id === draftPlan);
  const tenVisitInCart = cartLookup.get(tenVisitCard.id);
  const hasUnsavedSubscriptionChange =
    selectedOption === "subscription" && draftPlan !== currentPlan;

  const handleSelectOption = (option: AccessCardOptionId) => {
    setSelectedOption(option);
    setSaveStatus(null);

    if (option === "none") {
      return;
    }

    if (option === "subscription") {
      setDraftPlan(subscriptionPlanDraft);
    }
  };

  const handleSubmitSubscriptionChange = () => {
    if (typeof window === "undefined") {
      return;
    }

    const change: SubmittedChange = {
      requestedPlan: draftPlan,
      requestedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(
      ACCESS_CARD_CHANGE_STORAGE_KEY,
      JSON.stringify(change),
    );
    setSubmittedChange(change);
    setSaveStatus(
      `Deine Änderung auf „${formatPlanName(draftPlan)}“ wurde gespeichert und wird erst ab dem nächsten Monat wirksam.`,
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
        <PageTitle
          title="Zugangskarte"
          subTitle="Du hast genau drei Optionen: keine Zugangskarte, eine Abokarte oder eine 10er Karte."
          backLink={{ href: "/", label: "Back to dashboard" }}
        />

        <p className="text-sm text-zinc-500">
          Aktuell aktiv: {currentPlan === "none" ? "Keine Zugangskarte" : (currentPlanInfo?.title ?? "—")}
        </p>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            {accessCardOptions.map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer flex-col justify-between gap-4 rounded-2xl border p-4 text-sm transition ${
                  selectedOption === option.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                }`}
              >
                <div>
                  <p className="text-base font-semibold text-zinc-900">
                    {option.title}
                  </p>
                  <p className="mt-2 text-sm text-zinc-600">
                    {option.description}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    {selectedOption === option.id ? "Ausgewählt" : "Auswählen"}
                  </span>
                  <input
                    type="radio"
                    name="access-card-option"
                    value={option.id}
                    checked={selectedOption === option.id}
                    onChange={() => handleSelectOption(option.id)}
                    className="h-4 w-4 rounded-md accent-blue-600"
                  />
                </div>
              </label>
            ))}
          </div>
        </section>

        {selectedOption === "subscription" ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Abokarte auswählen
              </h2>
              <p className="text-sm text-zinc-500">
                Wähle aus wieviele Zugänge du pro Monat benötigst. Du kannst deine Auswahl jederzeit ändern, die Änderung wird aber immer erst ab dem nächsten Monat wirksam.
              </p>
            </div>
            <div className="text-xs text-zinc-500">
              Ausgewählt: {draftPlanInfo?.priceLabel ?? "—"}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {accessCardPlans.map((plan) => (
              <label
                key={plan.id}
                className={`flex h-full cursor-pointer flex-col justify-between gap-4 rounded-2xl border p-4 text-sm transition ${
                  draftPlan === plan.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {plan.title}
                      </p>
                      <p className="mt-2 text-xs text-zinc-600">
                        {plan.description}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold text-zinc-900">
                      {plan.priceLabel}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    {draftPlan === plan.id ? "Zur Bestätigung markiert" : "Auswählen"}
                  </span>
                  <input
                    type="radio"
                    name="access-card-plan"
                    value={plan.id}
                    checked={draftPlan === plan.id}
                    onChange={() => {
                      setSubscriptionPlanDraft(plan.id);
                      setSelectedOption("subscription");
                      setDraftPlan(plan.id);
                      setSaveStatus(null);
                    }}
                    className="h-4 w-4 rounded-md accent-blue-600"
                  />
                </div>
              </label>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {submittedChange ? (
              <p className="text-sm text-amber-700">
                Bereits eingereicht: {formatPlanName(submittedChange.requestedPlan)} – wirksam ab nächstem Monat.
              </p>
            ) : null}
            {saveStatus ? <p className="text-sm text-emerald-700">{saveStatus}</p> : null}
            <div className="flex justify-end">
              <Button
                type="button"
                kind="primary"
                onClick={handleSubmitSubscriptionChange}
                disabled={!hasUnsavedSubscriptionChange}
              >
                Abokarte buchen
              </Button>
            </div>
          </div>
          </section>
        ) : null}

        {selectedOption === "ten-visit" ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                10er Karte buchen
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                {tenVisitCard.details}
              </p>
            </div>
            <div className="text-xs text-zinc-500">Einmalzahlung: 50 €</div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">
              {tenVisitInCart
                ? `Im Warenkorb × ${tenVisitInCart.quantity ?? 1}`
                : "Noch nicht im Warenkorb"}
            </div>
            <div className="flex items-center gap-2">
              {tenVisitInCart ? (
                <Button
                  type="button"
                  onClick={handleDecreaseTenVisitCard}
                  kind="secondary"
                  className="px-3 py-1 text-xs"
                >
                  −
                </Button>
              ) : null}
              <Button
                type="button"
                kind="primary"
                onClick={handleAddTenVisitCard}
              >
                In den Warenkorb
              </Button>
            </div>
          </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
