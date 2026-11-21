import "../guard";
import { env, simulatorEnabled } from "../env";
import { PayPalProvider } from "./paypal";
import { SimulatorProvider } from "./simulator";
import { StripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";
import type { ProviderId } from "@/lib/types";

export type PaymentChoice = "card" | "paypal";

let registry: { stripe: StripeProvider; paypal: PayPalProvider; simCard: SimulatorProvider; simWallet: SimulatorProvider } | null = null;

function build() {
  const e = env();
  return {
    stripe: new StripeProvider({
      secretKey: e.STRIPE_SECRET_KEY,
      webhookSecret: e.STRIPE_WEBHOOK_SECRET,
      paymentMethodTypes: (e.STRIPE_PAYMENT_METHOD_TYPES ?? "card")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    }),
    paypal: new PayPalProvider({ env: e.PAYPAL_ENV, clientId: e.PAYPAL_CLIENT_ID, clientSecret: e.PAYPAL_CLIENT_SECRET, webhookId: e.PAYPAL_WEBHOOK_ID }),
    simCard: new SimulatorProvider("card"),
    simWallet: new SimulatorProvider("wallet"),
  };
}

function reg() {
  registry ??= build();
  return registry;
}

/** For tests: inject provider doubles. */
export function setProvidersForTesting(p: Partial<ReturnType<typeof build>> | null) {
  registry = p ? { ...build(), ...p } : null;
}

/** The provider that owns an existing attempt. */
export function getProvider(id: ProviderId): PaymentProvider {
  const r = reg();
  if (id === "stripe") return r.stripe;
  if (id === "paypal") return r.paypal;
  return r.simCard; // the simulator instance handles both flavours by reference
}

/**
 * The provider used for a new payment the customer chose. Real sandbox/live
 * credentials win; the simulator is only a fallback outside production.
 */
export function providerForChoice(choice: PaymentChoice, enabled: { stripe: boolean; paypal: boolean }): PaymentProvider | null {
  const r = reg();
  if (choice === "card") {
    if (enabled.stripe && r.stripe.configured()) return r.stripe;
    return simulatorEnabled() ? r.simCard : null;
  }
  if (enabled.paypal && r.paypal.configured()) return r.paypal;
  return simulatorEnabled() ? r.simWallet : null;
}

export function providerStatus() {
  const r = reg();
  return {
    stripe: r.stripe.mode(),
    paypal: r.paypal.mode(),
    simulator: simulatorEnabled() ? "enabled" : "disabled",
    appEnv: env().APP_ENV,
  };
}
