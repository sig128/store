"use server";

import { redirect } from "next/navigation";
import { appUrl, simulatorEnabled } from "@/server/env";
import { signSimulatorPayload, simulatorAct, type SimAction } from "@/server/payments/simulator";

const safe = (u: string | undefined) => (u && u.startsWith(appUrl("/")) ? u : appUrl("/checkout"));

/** Applies a buyer action at the simulated provider and delivers its signed webhooks over HTTP. */
export async function simulate(formData: FormData) {
  if (!simulatorEnabled()) throw new Error("Simulator disabled");
  const ref = String(formData.get("ref"));
  const action = String(formData.get("action")) as SimAction;
  const urls = { success: safe(String(formData.get("success") ?? "")), cancel: safe(String(formData.get("cancel") ?? "")), ret: safe(String(formData.get("ret") ?? "")) };
  const { events, redirect: where } = await simulatorAct(ref, action);
  const deliver = async () => {
    for (const ev of events) {
      const body = JSON.stringify(ev);
      await fetch(appUrl("/api/webhooks/simulator"), { method: "POST", headers: { "content-type": "application/json", "x-simulator-signature": signSimulatorPayload(body) }, body });
    }
  };
  if (formData.get("delay") === "1") {
    // Simulate a slow webhook: deliver after the buyer is already back on the store.
    setTimeout(() => void deliver().catch((e) => console.error("[simulator] delayed delivery failed", e)), 6000);
  } else {
    await deliver();
  }
  if (where === "success") redirect(urls.success);
  if (where === "cancel") redirect(urls.cancel);
  if (where === "return") redirect(urls.ret);
  redirect(`/dev/simulator/${ref}?${new URLSearchParams({ success: urls.success, cancel: urls.cancel, ret: urls.ret, done: action })}`);
}
