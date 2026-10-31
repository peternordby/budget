"use client";

import Link from "next/link";
import TagInsight from "@/components/TagInsight";

/**
 * Innsikt › Reiser: each merkelapp — in practice a trip — over its own dates,
 * which is why this page has no period picker.
 */
export default function ReiserPage() {
  return (
    <section className="card section-gap">
      <div className="card-head">
        <h2 className="section-title">Reiser</h2>
        <Link href="/profil/merkelapper" className="btn btn-ghost btn-small">
          Endre merkelapper
        </Link>
      </div>
      <TagInsight />
    </section>
  );
}
