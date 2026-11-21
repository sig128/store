import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/server/settings";
import { countryNames } from "@/server/policies";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact", description: "How to reach us about an order, sizing or a return.", alternates: { canonical: "/contact" } };

export default async function Contact() {
  const s = await getSettings();
  const seller = s.seller;
  const email = s.support.supportEmail;
  return (
    <article className="shell py-14 md:py-20">
      <p className="eyebrow">Help</p>
      <h1 className="display mt-3 text-[clamp(52px,8vw,112px)]">Contact</h1>
      <div className="mt-10 grid max-w-4xl gap-10 md:grid-cols-2">
        <section aria-labelledby="c-email">
          <h2 id="c-email" className="font-display text-[28px] font-extrabold uppercase leading-none">
            Email
          </h2>
          {email ? (
            <p className="mt-3">
              <a className="link text-lg" href={`mailto:${email}`}>
                {email}
              </a>
            </p>
          ) : (
            <p className="mt-3 text-bone-dim">Our support address is being set up.</p>
          )}
          <p className="mt-3 text-bone-dim">
            Include your order number if you have one. Lost your order email? <Link className="link" href="/support">Get a secure order link</Link>.
          </p>
        </section>
        <section aria-labelledby="c-seller">
          <h2 id="c-seller" className="font-display text-[28px] font-extrabold uppercase leading-none">
            Seller
          </h2>
          {seller.legalName ? (
            <address className="mt-3 not-italic text-bone-dim">
              <span className="text-bone">{seller.legalName}</span>
              {seller.tradingName && seller.tradingName !== seller.legalName ? ` (trading as ${seller.tradingName})` : ""}
              <br />
              {seller.orgNumber ? <>Org. no. {seller.orgNumber}{seller.vatNumber ? " MVA" : ""}<br /></> : null}
              {seller.addressLines.map((l) => (
                <span key={l}>
                  {l}
                  <br />
                </span>
              ))}
              {countryNames([seller.country])}
              {seller.phone ? (
                <>
                  <br />
                  Tel. {seller.phone}
                </>
              ) : null}
            </address>
          ) : (
            <p className="mt-3 text-bone-dim">Company details will be listed here before the shop opens.</p>
          )}
        </section>
      </div>
    </article>
  );
}
