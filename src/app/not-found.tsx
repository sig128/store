import Link from "next/link";
import { brand } from "@/config/brand";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-night px-6 text-bone">
      <div className="max-w-xl text-center">
        <p className="eyebrow">404 · {brand.heroTime}</p>
        <h1 className="display mt-4 text-[clamp(56px,10vw,128px)]">Lights out.</h1>
        <p className="mt-4 text-bone-dim">Nothing on this rack. The page may have moved, or the link was mistyped.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="btn btn-primary">
            Shop the drop
          </Link>
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
