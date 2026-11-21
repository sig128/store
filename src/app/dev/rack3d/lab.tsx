"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { RackStageState } from "@/components/store/rack3d/stage";

const RackStage = dynamic(() => import("@/components/store/rack3d/stage"), { ssr: false });
const VARIANTS = ["LS-WBLK", "NR-CHAR", "HC-ASPH", "AH-WBLK-CS", "FW-WBLK", "CT-NIGHT"];

declare global {
  interface Window {
    __ahaReady?: boolean;
    __ahaSet?: (i: number, t: number) => void;
  }
}

export function Lab({ index, t, quality, reduced }: { index: number; t: number; quality: "high" | "low"; reduced: boolean }) {
  const state = useRef<RackStageState>({ active: index, t });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    window.__ahaSet = (i, tt) => {
      state.current = { active: i, t: tt };
    };
  }, []);
  return (
    <div className="grid min-h-dvh place-items-center bg-black p-0">
      <div className="relative h-[100dvh] w-full max-w-[100vw]" data-ready={ready ? "1" : "0"}>
        <RackStage
          items={VARIANTS.map((variant) => ({ variant }))}
          stateRef={state}
          quality={quality}
          reducedMotion={reduced}
          running
          onReady={() => {
            setReady(true);
            window.__ahaReady = true;
          }}
        />
      </div>
    </div>
  );
}
