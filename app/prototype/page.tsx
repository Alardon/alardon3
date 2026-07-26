import type { Metadata } from "next";
import SceneClient from "./components/SceneClient";

export const metadata: Metadata = {
  title: "Alardon — World Prototype",
  description: "Procedural terrain, animated sprites, RTS camera demo",
};

export default function PrototypePage() {
  return (
    <main className="w-full h-full">
      <SceneClient />
    </main>
  );
}
