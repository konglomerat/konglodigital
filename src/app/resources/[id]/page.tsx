"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, use } from "react";
import Link from "next/link";

type ResourceCategory = {
  name?: string;
  bookingCategoryId?: string;
};

type Resource = {
  id: string;
  name: string;
  description?: string;
  image?: string | null;
  type?: string;
  attachable?: boolean;
  tags?: string[];
  categories?: ResourceCategory[];
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
};

export default function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadResource = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const data = await fetchJson<{ resource: Resource }>(
          `/api/campai/resources/${id}`,
        );
        if (active) {
          setResource(data.resource ?? null);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load Campai resource.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadResource();

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Resource details
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              View details and metadata for the selected resource.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/resources"
              className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600"
            >
              Back to resources
            </Link>
            <Link
              href="/"
              className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600"
            >
              Dashboard
            </Link>
          </div>
        </header>

        {errorMessage ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </section>
        ) : null}

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading resource...</p>
          ) : !resource ? (
            <p className="text-sm text-zinc-500">Resource not found.</p>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50/60">
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  {resource.image ? (
                    <img
                      src={resource.image}
                      alt={resource.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-100">
                      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
                        No image
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  {resource.name}
                </h2>
                {resource.description ? (
                  <p className="mt-2 text-sm text-zinc-600">
                    {resource.description}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
                {resource.type ? (
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                    {resource.type}
                  </span>
                ) : null}
                {resource.attachable !== undefined ? (
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                    {resource.attachable ? "Attachable" : "Not attachable"}
                  </span>
                ) : null}
                {resource.tags?.map((tag) => (
                  <span
                    key={`${resource.id}-${tag}`}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              {resource.categories && resource.categories.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                    Categories
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
                    {resource.categories.map((category, index) => (
                      <li
                        key={`${resource.id}-category-${index}`}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1"
                      >
                        {category.name ?? category.bookingCategoryId ?? ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
