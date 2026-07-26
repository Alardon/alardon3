"use client";

import dynamic from "next/dynamic";

// Three.js / R3F requires browser — load client-side only
const Scene = dynamic(() => import("./Scene"), { ssr: false });

export default function SceneClient() {
  return <Scene />;
}
