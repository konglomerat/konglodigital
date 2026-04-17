import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  normalizeMaterialOrderDraft,
  normalizeMaterialOrderSummary,
} from "@/lib/material-orders";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const parseEuro = (value: string) => {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";

  if (id) {
    const { data: row, error } = await supabase
      .from("material_orders")
      .select(
        "id, supplier_name, supplier_invoice_number, supplier_invoice_date, participant_count, total_amount_euro, shipping_amount_euro, created_at, updated_at, payload",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const draft = normalizeMaterialOrderDraft(row.payload);
    const summary = normalizeMaterialOrderSummary({
      id: row.id,
      supplierName: row.supplier_name,
      supplierInvoiceNumber: row.supplier_invoice_number,
      supplierInvoiceDate: row.supplier_invoice_date,
      participantCount: row.participant_count,
      totalAmountEuro: row.total_amount_euro,
      shippingAmountEuro: row.shipping_amount_euro,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });

    return NextResponse.json({ order: summary, draft });
  }

  const { data: rows, error } = await supabase
    .from("material_orders")
    .select(
      "id, supplier_name, supplier_invoice_number, supplier_invoice_date, participant_count, total_amount_euro, shipping_amount_euro, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = (rows ?? [])
    .map((row) =>
      normalizeMaterialOrderSummary({
        id: row.id,
        supplierName: row.supplier_name,
        supplierInvoiceNumber: row.supplier_invoice_number,
        supplierInvoiceDate: row.supplier_invoice_date,
        participantCount: row.participant_count,
        totalAmountEuro: row.total_amount_euro,
        shippingAmountEuro: row.shipping_amount_euro,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    )
    .filter(Boolean);

  return NextResponse.json({ orders });
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    draft?: unknown;
  };

  const draft = normalizeMaterialOrderDraft(body.draft);
  if (!draft || draft.participants.length === 0) {
    return NextResponse.json(
      { error: "Entwurf ist unvollstaendig." },
      { status: 400 },
    );
  }

  const totalAmountEuro = roundCurrency(
    draft.participants.reduce((sum, participant) => {
      const positionsTotal = participant.positions.reduce(
        (positionSum, position) =>
          positionSum +
          parseEuro(position.quantity) * parseEuro(position.unitAmountEuro),
        0,
      );
      const shipping = parseEuro(participant.manualShippingShareEuro);
      return sum + positionsTotal + shipping;
    }, 0),
  );

  const payload = {
    owner_id: data.user.id,
    supplier_name: draft.supplierName,
    supplier_invoice_number: draft.supplierInvoiceNumber,
    supplier_invoice_date: draft.supplierInvoiceDate || null,
    participant_count: draft.participants.length,
    total_amount_euro: totalAmountEuro,
    shipping_amount_euro: parseEuro(draft.shippingAmountEuro),
    payload: draft,
    updated_at: new Date().toISOString(),
  };

  const mutation = body.id?.trim()
    ? supabase
        .from("material_orders")
        .update(payload)
        .eq("id", body.id.trim())
        .select("id")
        .single()
    : supabase
        .from("material_orders")
        .insert(payload)
        .select("id")
        .single();

  const { data: saved, error } = await mutation;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: saved.id });
};

export const DELETE = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
  }

  const { error } = await supabase
    .from("material_orders")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
};
