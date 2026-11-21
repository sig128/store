"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { MediaView } from "@/server/catalog";
import { ConceptTag } from "@/components/store/primitives";

const LABEL: Record<string, string> = {
  front: "Front",
  back: "Back",
  print_detail: "Print detail",
  on_body: "On body",
  fabric: "Fabric",
  styled: "Styled",
  lookbook: "Styled",
};

export function Gallery({ media, productName }: { media: MediaView[]; productName: string }) {
  const items = media.filter((m) => !m.kind.endsWith("_unlit"));
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [media]);
  const cur = items[i] ?? items[0];
  if (!cur) return <div className="aspect-[4/5] bg-night-2" />;
  return (
    <div className="min-w-0">
      {/* Desktop: main image + thumbnails */}
      <div className="hidden md:block">
        <div className="stage-wall relative aspect-[4/5] overflow-hidden border border-rule">
          <Image key={cur.id} src={cur.url} alt={cur.alt} fill sizes="(min-width: 1024px) 56vw, 90vw" className={cur.kind === "print_detail" || cur.kind === "lookbook" ? "object-cover" : "object-contain p-[4%]"} quality={85} preload={i === 0} />
          {cur.source === "concept_render" ? <ConceptTag className="absolute left-3 top-3" /> : null}
          <p className="eyebrow absolute bottom-3 left-3">{LABEL[cur.kind] ?? cur.kind}</p>
        </div>
        <ul className="mt-3 grid grid-cols-5 gap-3" aria-label={`${productName} images`}>
          {items.map((m, idx) => (
            <li key={m.id}>
              <button type="button" onClick={() => setI(idx)} aria-current={idx === i ? "true" : undefined} aria-label={`Show ${LABEL[m.kind] ?? m.kind} image`} className={`relative block aspect-[4/5] w-full overflow-hidden border ${idx === i ? "border-bone" : "border-rule hover:border-rule-strong"} bg-night-2`}>
                <Image src={m.url} alt="" fill sizes="10vw" className={m.kind === "print_detail" || m.kind === "lookbook" ? "object-cover" : "object-contain p-1"} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {/* Mobile: horizontal swipe, native scroll */}
      <div className="md:hidden">
        <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none]" aria-label={`${productName} images`}>
          {items.map((m, idx) => (
            <li key={m.id} className="stage-wall relative aspect-[4/5] w-[86vw] shrink-0 snap-center overflow-hidden">
              <Image src={m.url} alt={m.alt} fill sizes="86vw" className={m.kind === "print_detail" || m.kind === "lookbook" ? "object-cover" : "object-contain p-[4%]"} preload={idx === 0} />
              {m.source === "concept_render" ? <ConceptTag className="absolute left-2 top-2" /> : null}
              <p className="eyebrow absolute bottom-2 left-2">
                {LABEL[m.kind] ?? m.kind} · {idx + 1}/{items.length}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
