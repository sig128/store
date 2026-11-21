import { getImageProps } from "next/image";
import Link from "next/link";
import { brand } from "@/config/brand";
import { formatMoney } from "@/lib/money";
import type { ProductView } from "@/server/catalog";
import { HERO_BLUR } from "./hero-blur";

/** 01 / OUTSIDE THE GYM — full-bleed night exterior, headline, two actions, the collection index. */
export function OutsideTheGym({ products }: { products: ProductView[] }) {
  const alt = "Illustration: a concrete gym at night with its roll-up door half open, warm light on wet asphalt, a fluorescent strip over the steel door and a training poster on the wall.";
  const common = { alt, sizes: "100vw", quality: 75 };
  const desktop = getImageProps({ ...common, src: "/scenes/hero-desktop.webp", width: 2400, height: 1350, fetchPriority: "high" });
  const mobile = getImageProps({ ...common, src: "/scenes/hero-mobile.webp", width: 1200, height: 1800, fetchPriority: "high" });
  const [l1, l2] = brand.heroHeadline.split(/(?<=\.)\s+/);
  const from = products.length ? Math.min(...products.map((p) => p.fromPriceMinor)) : 0;
  const currency = products[0]?.currency ?? "NOK";

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden border-b border-rule">
      <picture>
        <source media="(min-width: 768px)" srcSet={desktop.props.srcSet} sizes="100vw" />
        <source media="(max-width: 767px)" srcSet={mobile.props.srcSet} sizes="100vw" />
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img
          {...desktop.props}
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[62%_50%] md:object-center"
          style={{ backgroundImage: `url(${HERO_BLUR})`, backgroundSize: "cover" }}
        />
      </picture>
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-night via-night/40 to-transparent md:bg-[linear-gradient(90deg,rgb(13_13_12/0.92)_0%,rgb(13_13_12/0.7)_38%,rgb(13_13_12/0.1)_66%,transparent_80%)]" aria-hidden />

      <div className="shell flex min-h-[calc(100svh-var(--header-h)-30px)] max-h-[1100px] flex-col justify-end pb-6 pt-24 md:pb-10">
        <p className="eyebrow text-bone">
          01 / Outside the gym · <span className="mono">{brand.heroTime}</span>
        </p>
        <h1 id="hero-title" className="display mt-4 text-[clamp(66px,12.5vw,212px)]">
          <span className="block">{l1}</span>
          <span className="block text-fluoro">{l2}</span>
        </h1>
        <p className="mt-5 max-w-[46ch] text-[16px] text-bone-dim md:text-[17px]">
          {brand.dropName}. Six pieces of printed gymwear for the last set of the night — from <span className="num text-bone">{formatMoney(from, currency)}</span>.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="#shop-the-drop" className="btn btn-primary">
            Shop Drop 01
          </Link>
          <Link href="/lookbook" className="btn btn-ghost bg-night/40">
            Enter the lookbook
          </Link>
        </div>

        <nav aria-label="Drop 01 pieces" className="mt-10 border-t border-rule-strong pt-4">
          <ol className="grid grid-cols-3 gap-x-4 gap-y-2 md:grid-cols-6">
            {products.map((p, i) => (
              <li key={p.id}>
                <Link href={`/products/${p.slug}`} className="group block">
                  <span className="mono text-[10px] text-bone-mute">{String(i + 1).padStart(2, "0")}</span>
                  <span className="block font-display text-[19px] font-extrabold uppercase leading-none group-hover:text-fluoro md:text-[22px]">{p.name}</span>
                  <span className="num hidden text-xs text-bone-dim md:block">{formatMoney(p.fromPriceMinor, p.currency)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </section>
  );
}
