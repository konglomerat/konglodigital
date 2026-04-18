"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { faArrowLeft, faCodeCompare } from "@fortawesome/free-solid-svg-icons";

import { buildResourcePath } from "@/lib/resource-pretty-title";
import { useI18n } from "@/i18n/client";
import { localizePathname, RESOURCES_NAMESPACE } from "@/i18n/config";
import Button from "../../components/Button";

export type DuplicateDetectionResource = {
  id: string;
  prettyTitle: string | null;
  name: string;
  type: string | null;
  tags: string[];
  image: string | null;
  images: string[];
};

type DuplicatePair = {
  id: string;
  left: DuplicateDetectionResource;
  right: DuplicateDetectionResource;
  score: number;
  reasons: string[];
};

type DuplicatesPageClientProps = {
  initialResources: DuplicateDetectionResource[];
};

type ResolvePayload = {
  mode: "pick" | "merge";
  keepResourceId: string;
  removeResourceId: string;
};

type ResolveResponse = {
  success?: boolean;
  error?: string;
  keptResource?: {
    id: string;
    image: string | null;
    images: string[] | null;
  };
};

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenize = (value: string) =>
  normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

const buildBigrams = (value: string) => {
  if (value.length < 2) {
    return value ? [value] : [];
  }
  const grams: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    grams.push(value.slice(index, index + 2));
  }
  return grams;
};

const diceSimilarity = (a: string, b: string) => {
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }

  const gramsA = buildBigrams(a);
  const gramsB = buildBigrams(b);
  if (gramsA.length === 0 || gramsB.length === 0) {
    return 0;
  }

  const countA = new Map<string, number>();
  gramsA.forEach((gram) => {
    countA.set(gram, (countA.get(gram) ?? 0) + 1);
  });

  let overlap = 0;
  gramsB.forEach((gram) => {
    const count = countA.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      countA.set(gram, count - 1);
    }
  });

  return (2 * overlap) / (gramsA.length + gramsB.length);
};

const jaccardSimilarity = (a: string[], b: string[]) => {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  setA.forEach((entry) => {
    if (setB.has(entry)) {
      intersection += 1;
    }
  });
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
};

const collectImageUrls = (resource: DuplicateDetectionResource) => {
  const all = [resource.image, ...resource.images].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return Array.from(new Set(all));
};

const toRoundedScore = (value: number) => Math.round(value * 100) / 100;

const buildDuplicatePair = (
  left: DuplicateDetectionResource,
  right: DuplicateDetectionResource,
): DuplicatePair | null => {
  const reasons: string[] = [];

  const leftName = normalizeText(left.name);
  const rightName = normalizeText(right.name);
  const leftPrettyTitle = normalizeText(left.prettyTitle);
  const rightPrettyTitle = normalizeText(right.prettyTitle);

  const nameSimilarity = diceSimilarity(leftName, rightName);
  const tokenSimilarity = jaccardSimilarity(tokenize(left.name), tokenize(right.name));

  let score = 0;

  if (leftName && leftName === rightName) {
    score += 0.65;
    reasons.push("same normalized name");
  } else {
    score += nameSimilarity * 0.45;
    score += tokenSimilarity * 0.2;
    if (nameSimilarity >= 0.92) {
      reasons.push("very similar name");
    } else if (nameSimilarity >= 0.8 || tokenSimilarity >= 0.8) {
      reasons.push("similar name tokens");
    }
  }

  if (leftPrettyTitle && rightPrettyTitle && leftPrettyTitle === rightPrettyTitle) {
    score += 0.45;
    reasons.push("same pretty title");
  }

  const leftType = normalizeText(left.type);
  const rightType = normalizeText(right.type);
  if (leftType && rightType && leftType === rightType) {
    score += 0.08;
  }

  const tagScore = jaccardSimilarity(
    left.tags.map((tag) => normalizeText(tag)).filter(Boolean),
    right.tags.map((tag) => normalizeText(tag)).filter(Boolean),
  );
  if (tagScore > 0) {
    score += tagScore * 0.1;
    if (tagScore >= 0.6) {
      reasons.push("overlapping tags");
    }
  }

  const leftImages = collectImageUrls(left);
  const rightImages = collectImageUrls(right);
  const sharedImages = leftImages.filter((url) => rightImages.includes(url));
  if (sharedImages.length > 0) {
    score += 0.45;
    reasons.push("shares photo URL");
  }

  const strongestSignal =
    leftName === rightName ||
    sharedImages.length > 0 ||
    (leftPrettyTitle && rightPrettyTitle && leftPrettyTitle === rightPrettyTitle) ||
    nameSimilarity >= 0.9;

  if (!strongestSignal) {
    return null;
  }

  const normalizedScore = Math.min(1, score);
  if (normalizedScore < 0.72) {
    return null;
  }

  return {
    id: `${left.id}:${right.id}`,
    left,
    right,
    score: toRoundedScore(normalizedScore),
    reasons,
  };
};

const buildDuplicatePairs = (resources: DuplicateDetectionResource[]) => {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < resources.length; i += 1) {
    for (let j = i + 1; j < resources.length; j += 1) {
      const pair = buildDuplicatePair(resources[i], resources[j]);
      if (pair) {
        pairs.push(pair);
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score);
};

const getPreviewImage = (resource: DuplicateDetectionResource) => {
  const images = collectImageUrls(resource);
  return images[0] ?? null;
};

const withUpdatedResource = (
  resources: DuplicateDetectionResource[],
  keptResource: ResolveResponse["keptResource"],
  removedResourceId: string,
) => {
  return resources
    .map((resource) => {
      if (!keptResource || resource.id !== keptResource.id) {
        return resource;
      }
      return {
        ...resource,
        image: keptResource.image,
        images: Array.isArray(keptResource.images)
          ? keptResource.images.filter((url): url is string => typeof url === "string")
          : [],
      };
    })
    .filter((resource) => resource.id !== removedResourceId);
};

const scoreBadgeClassName = (score: number) => {
  if (score >= 0.95) {
    return "border-destructive-border bg-destructive-soft text-destructive";
  }
  if (score >= 0.85) {
    return "border-warning-border bg-warning-soft text-warning";
  }
  return "border-info-border bg-info-soft text-info";
};

export default function DuplicatesPageClient({
  initialResources,
}: DuplicatesPageClientProps) {
  const { tx, locale } = useI18n(RESOURCES_NAMESPACE);
  const [resources, setResources] = useState(initialResources);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const duplicatePairs = useMemo(() => buildDuplicatePairs(resources), [resources]);

  const runResolve = async (
    payload: ResolvePayload,
    actionLabel: string,
    fromName: string,
    toName: string,
  ) => {
    const actionKey = `${payload.mode}:${payload.keepResourceId}:${payload.removeResourceId}`;
    if (activeAction === actionKey) {
      return;
    }

    const confirmed = window.confirm(
      payload.mode === "merge"
        ? `${tx("Merge photos from")} \"${fromName}\" ${tx("into")} \"${toName}\" ${tx("and delete")} \"${fromName}\"?`
        : `${tx("Delete")} \"${fromName}\" ${tx("and keep")} \"${toName}\"?`,
    );
    if (!confirmed) {
      return;
    }

    setActiveAction(actionKey);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/campai/resources/duplicates", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ResolveResponse;
      if (!response.ok) {
        throw new Error(data.error ?? tx("Unable to resolve duplicate."));
      }

      setResources((previous) =>
        withUpdatedResource(previous, data.keptResource, payload.removeResourceId),
      );
      setSuccessMessage(actionLabel);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : tx("Unable to resolve duplicate."),
      );
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <main className="min-h-screen bg-muted/50 text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {tx("Duplicate resources")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {tx(
                "Review likely duplicates and either keep one or merge photos.",
                "en",
              )}
            </p>
          </div>
          <Button
            href={localizePathname("/resources", locale)}
            kind="secondary"
            icon={faArrowLeft}
          >
            {tx("Back to resources")}
          </Button>
        </header>

        <section className="rounded-2xl border border-border bg-card p-4 text-sm text-foreground/80">
          {tx(
            "Detection uses normalized name similarity, pretty title matches, tag overlap, and shared photo URLs. Only high-confidence matches are shown.",
            "en",
          )}
        </section>

        {errorMessage ? (
          <section className="rounded-2xl border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive">
            {errorMessage}
          </section>
        ) : null}

        {successMessage ? (
          <section className="rounded-2xl border border-success-border bg-success-soft p-4 text-sm text-success">
            {successMessage}
          </section>
        ) : null}

        {duplicatePairs.length === 0 ? (
          <section className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
            {tx("No high-confidence duplicates found.")}
          </section>
        ) : (
          <section className="space-y-4">
            {duplicatePairs.map((pair) => {
              const leftImage = getPreviewImage(pair.left);
              const rightImage = getPreviewImage(pair.right);
              const leftToRightPickLabel = `${tx("Kept")} ${pair.right.name} ${tx("and deleted")} ${pair.left.name}.`;
              const rightToLeftPickLabel = `${tx("Kept")} ${pair.left.name} ${tx("and deleted")} ${pair.right.name}.`;
              const leftToRightMergeLabel = `${tx("Merged photos into")} ${pair.right.name} ${tx("and deleted")} ${pair.left.name}.`;
              const rightToLeftMergeLabel = `${tx("Merged photos into")} ${pair.left.name} ${tx("and deleted")} ${pair.right.name}.`;

              return (
                <article
                  key={pair.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.18em]">
                        <span className="text-foreground/80">{tx("Candidate")}</span>
                        <span className="text-muted-foreground/80">#{pair.id.slice(0, 8)}</span>
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 font-semibold ${scoreBadgeClassName(pair.score)}`}
                      >
                        {tx("score")} {(pair.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border bg-muted/50 px-2 py-1">
                        {pair.reasons.length > 0
                          ? pair.reasons
                              .map((reason) => tx(reason))
                              .join(" + ")
                          : tx("similar metadata")}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
                    <div className="rounded-xl border border-border bg-muted/50 p-3">
                      <div className="flex flex-col gap-3">
                        {leftImage ? (
                          <img
                            src={leftImage}
                            alt={pair.left.name}
                            className="h-36 w-full rounded-lg border border-border bg-card object-cover"
                          />
                        ) : (
                          <div className="flex h-36 w-full items-center justify-center rounded-lg border border-border bg-card text-xs uppercase tracking-[0.14em] text-muted-foreground/80">
                            {tx("No image")}
                          </div>
                        )}
                        <div>
                          <a
                            href={localizePathname(
                              buildResourcePath({
                                id: pair.left.id,
                                prettyTitle: pair.left.prettyTitle,
                              }),
                              locale,
                            )}
                            className="text-sm font-semibold text-foreground hover:underline"
                          >
                            {pair.left.name}
                          </a>
                          <p className="mt-1 text-xs text-muted-foreground">{pair.left.id}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {collectImageUrls(pair.left).length} {tx("photo(s)")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-center">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground/80">
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4"
                          aria-hidden="true"
                          fill="currentColor"
                        >
                          <path d="M7 4a1 1 0 1 0-2 0v1H4a1 1 0 1 0 0 2h1v1a1 1 0 1 0 2 0V7h1a1 1 0 1 0 0-2H7V4ZM4 12a1 1 0 0 0 0 2h6a1 1 0 1 0 0-2H4Zm8.293-8.707a1 1 0 0 1 1.414 0l1.586 1.586 1.586-1.586a1 1 0 1 1 1.414 1.414l-1.586 1.586 1.586 1.586a1 1 0 1 1-1.414 1.414l-1.586-1.586-1.586 1.586a1 1 0 0 1-1.414-1.414l1.586-1.586-1.586-1.586a1 1 0 0 1 0-1.414ZM12 13a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2h-4Z" />
                        </svg>
                      </span>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/50 p-3">
                      <div className="flex flex-col gap-3">
                        {rightImage ? (
                          <img
                            src={rightImage}
                            alt={pair.right.name}
                            className="h-36 w-full rounded-lg border border-border bg-card object-cover"
                          />
                        ) : (
                          <div className="flex h-36 w-full items-center justify-center rounded-lg border border-border bg-card text-xs uppercase tracking-[0.14em] text-muted-foreground/80">
                            {tx("No image")}
                          </div>
                        )}
                        <div>
                          <a
                            href={localizePathname(
                              buildResourcePath({
                                id: pair.right.id,
                                prettyTitle: pair.right.prettyTitle,
                              }),
                              locale,
                            )}
                            className="text-sm font-semibold text-foreground hover:underline"
                          >
                            {pair.right.name}
                          </a>
                          <p className="mt-1 text-xs text-muted-foreground">{pair.right.id}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {collectImageUrls(pair.right).length} {tx("photo(s)")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    <Button
                      kind="danger-secondary"
                      disabled={Boolean(activeAction)}
                      onClick={() => {
                        void runResolve(
                          {
                            mode: "pick",
                            keepResourceId: pair.left.id,
                            removeResourceId: pair.right.id,
                          },
                          rightToLeftPickLabel,
                          pair.right.name,
                          pair.left.name,
                        );
                      }}
                    >
                      {tx("Keep left, delete right")}
                    </Button>
                    <Button
                      kind="danger-secondary"
                      disabled={Boolean(activeAction)}
                      onClick={() => {
                        void runResolve(
                          {
                            mode: "pick",
                            keepResourceId: pair.right.id,
                            removeResourceId: pair.left.id,
                          },
                          leftToRightPickLabel,
                          pair.left.name,
                          pair.right.name,
                        );
                      }}
                    >
                      {tx("Keep right, delete left")}
                    </Button>
                    <Button
                      kind="secondary"
                      icon={faCodeCompare}
                      disabled={Boolean(activeAction)}
                      onClick={() => {
                        void runResolve(
                          {
                            mode: "merge",
                            keepResourceId: pair.left.id,
                            removeResourceId: pair.right.id,
                          },
                          rightToLeftMergeLabel,
                          pair.right.name,
                          pair.left.name,
                        );
                      }}
                    >
                      {tx("Merge photos into left")}
                    </Button>
                    <Button
                      kind="secondary"
                      icon={faCodeCompare}
                      disabled={Boolean(activeAction)}
                      onClick={() => {
                        void runResolve(
                          {
                            mode: "merge",
                            keepResourceId: pair.right.id,
                            removeResourceId: pair.left.id,
                          },
                          leftToRightMergeLabel,
                          pair.left.name,
                          pair.right.name,
                        );
                      }}
                    >
                      {tx("Merge photos into right")}
                    </Button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
