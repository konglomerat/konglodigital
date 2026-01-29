"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
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

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadResources = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const params = new URLSearchParams({
          limit: "50",
          offset: "0",
          searchTerm,
        });
        const data = await fetchJson<{ resources: Resource[]; count: number }>(
          `/api/campai/resources?${params.toString()}`,
        );
        if (active) {
          setResources(data.resources ?? []);
          setCount(typeof data.count === "number" ? data.count : null);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load Campai resources.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadResources();

    return () => {
      active = false;
    };
  }, [searchTerm]);

  const visibleResources = useMemo(() => {
    return resources.map((resource) => ({
      ...resource,
      image: resource.image ?? null,
    }));
  }, [resources]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Campai resources
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Browse resources with their images and metadata.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600"
          >
            Back to dashboard
          </Link>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Resources</h2>
            <p className="text-xs text-zinc-500">
              {loading
                ? "Loading..."
                : `${visibleResources.length} of ${count ?? visibleResources.length}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-500" htmlFor="resource-search">
              Search
            </label>
            <input
              id="resource-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Name or tag"
              className="w-52 rounded-full border border-zinc-200 px-3 py-2 text-xs text-zinc-700 focus:border-zinc-400 focus:outline-none"
            />
          </div>
        </section>

        {errorMessage ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </section>
        ) : null}

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading resources...</p>
          ) : visibleResources.length === 0 ? (
            <p className="text-sm text-zinc-500">No resources found.</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visibleResources.map((resource) => (
                <article
                  key={resource.id}
                  className="overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50/60"
                >
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
                  <div className="flex flex-col gap-3 p-4">
                    <div>
                      <Link
                        href={`/resources/${resource.id}`}
                        className="text-sm font-semibold text-zinc-900 hover:underline"
                      >
                        {resource.name}
                      </Link>
                      {resource.description ? (
                        <p className="mt-2 text-xs text-zinc-500">
                          {resource.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-zinc-600">
                      {resource.type ? (
                        <span className="rounded-full border border-zinc-200 bg-white px-2 py-1">
                          {resource.type}
                        </span>
                      ) : null}
                      {resource.attachable !== undefined ? (
                        <span className="rounded-full border border-zinc-200 bg-white px-2 py-1">
                          {resource.attachable
                            ? "Attachable"
                            : "Not attachable"}
                        </span>
                      ) : null}
                      {resource.tags?.slice(0, 3).map((tag) => (
                        <span
                          key={`${resource.id}-${tag}`}
                          className="rounded-full border border-zinc-200 bg-white px-2 py-1"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                    {resource.categories && resource.categories.length > 0 ? (
                      <div className="text-[11px] text-zinc-500">
                        Categories:{" "}
                        {resource.categories
                          .map((category) => category.name)
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    ) : null}
                    <div className="flex justify-end">
                      <Link
                        href={`/resources/${resource.id}`}
                        className="text-xs font-semibold text-zinc-500 hover:text-zinc-800"
                      >
                        View details
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
