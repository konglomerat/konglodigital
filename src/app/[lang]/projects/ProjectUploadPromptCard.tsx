import Link from "next/link";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";

export default async function ProjectUploadPromptCard() {
  const { locale, tx } = await getServerI18n();
  const articleLink = localizePathname("/projects/new", locale);

  return (
    <aside className="relative isolate h-full overflow-hidden rounded-2xl border border-red-500 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_38%),linear-gradient(135deg,#b91c1c_0%,#dc2626_52%,#ef4444_100%)] shadow-sm md:col-span-2 xl:col-span-2">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 top-5 h-28 w-28 rounded-full bg-red-300/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-12 h-24 w-24 rounded-full bg-rose-200/30 blur-3xl"
      />

      <div className="relative flex h-full flex-col gap-5 p-9 md:p-8 md:px-10">
        <div className="space-y-4">
          <span className="inline-flex max-w-xl py-1 text-[80px] font-black leading-[1.1] text-white">
            {tx("Dein Projekt fehlt noch!", "de")}
          </span>
          <div className="space-y-3">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-white md:text-2xl">
              {tx(
                "Irgendwer muss der Welt doch zeigen, was bei uns zwischen Sägespänen und Koffein entstanden ist.",
                "de",
              )}
            </h2>
            {/* <p className="max-w-lg text-sm leading-relaxed text-white md:text-base">
              {tx(
                "Dein Projekt muss noch nicht perfekt sein. Wenn schon etwas Spannendes entstanden ist, dann zeig es uns hier - genau solche Ideen bringen andere auf neue Gedanken.",
                "de",
              )}
            </p> */}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-end pt-4 text-white">
          <Link
            href={articleLink}
            className="inline-flex items-center gap-2 font-semibold text-white transition hover:text-red-100 md:text-xl"
          >
            <span>{tx("Projekt hochladen", "de")}</span>
            <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
