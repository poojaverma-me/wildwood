import type { Metadata } from "next";
import HowClient from "./HowClient";

export const metadata: Metadata = { title: "How Jev hears you — Wildwood" };

export default function HowPage() {
  return (
    <div className="fixed inset-0">
      <HowClient />
    </div>
  );
}
