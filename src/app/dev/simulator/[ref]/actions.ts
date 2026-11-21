"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { appUrl, simulatorEnabled } from "@/server/env";
import { signSimulatorPayload, simulatorAct, type SimAction } from "@/server/payments/simulator";
import { handleWebhook } from "@/server/payments/webhook-route";

const safe = (u: string | undefined) => (u && u.startsWith(appUrl("/")) ? u : appUrl("/checkout"));

/**
 * Applies a buyer action at the simulated provider and delivers its signed webhooks
 * to the same handler a real provider's webhook hits (signature check included).
 * Delivery is in-process rather than over HTTP, so it also works behind hosting
 * login protection and on the embedded demo database.
 */
export async function simulate(formData: FormData) {
  if (!simulatorEnabled()) throw new Error("Simulator disabled");
  const ref = String(formData.get("ref"));
  const action = String(formData.get("action")) as SimAction;
  const urls = { success: safe(String(formData.get("success") ?? "")), cancel: safe(String(formData.get("cancel") ?? "")), ret: safe(String(formData.get("ret") ?? "")) };
  const { events, redirect: where } = await simulatorAct(ref, action);
  const deliver = async () => {
    for (const ev of events) {
      const body = JSON.stringify(ev);
      const req = new Request(appUrl("/api/webhooks/simulator"), { method: "POST", headers: { "content-type": "application/json", "x-simulator-signature": signSimulatorPayload(body) }, body });
      const res = await handleWebhook("simulator", req);
      if (!res.ok) console.error(`[simulator] webhook answered ${res.status}`);
    }
  };
  if (formData.get("delay") === "1") {
    // Simulate a slow webhook: deliver after the buyer is already back on the store.
    after(async () => {
      await new Promise((r) => setTimeout(r, 6000));
      await deliver().catch((e) => console.error("[simulator] delayed delivery failed", e));
    });
  } else {
    await deliver();
  }
  if (where === "success") redirect(urls.success);
  if (where === "cancel") redirect(urls.cancel);
  if (where === "return") redirect(urls.ret);
  redirect(`/dev/simulator/${ref}?${new URLSearchParams({ success: urls.success, cancel: urls.cancel, ret: urls.ret, done: action })}`);
}
