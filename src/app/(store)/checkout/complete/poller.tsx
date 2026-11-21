"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Polls verified order state; refreshes the page when it changes. Works with animations disabled. */
export function StatusPoller({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let stopped = false;
    let n = 0;
    const tick = async () => {
      if (stopped) return;
      n += 1;
      setTries(n);
      try {
        const r = await fetch(`/api/orders/status?order=${orderId}`, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { paymentStatus: string };
          if (j.paymentStatus !== "unpaid" && j.paymentStatus !== "processing") {
            router.refresh();
            return;
          }
          if (j.paymentStatus === "processing" && n > 3) router.refresh();
        }
      } catch {
        /* network blip — keep polling */
      }
      if (n > 30) setSlow(true);
      setTimeout(tick, n < 30 ? 2000 : 10000);
    };
    const t = setTimeout(tick, 1500);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [orderId, router]);
  return (
    <p className="mt-4 text-sm text-bone-dim" role="status" aria-live="polite">
      {slow ? "Still waiting for the provider. We'll email you when it's confirmed — you can safely close this page." : `Checking… (${tries})`}
    </p>
  );
}
