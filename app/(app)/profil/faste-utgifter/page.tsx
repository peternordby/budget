"use client";

import Link from "next/link";
import RecurringTemplates from "@/components/RecurringTemplates";
import { IconChevronLeft } from "@/components/icons";

/** Settings: the fixed-expense templates. Booking them is done in the list. */
export default function FasteUtgifterPage() {
  return (
    <>
      <div className="section-gap">
        <Link href="/profil" className="btn btn-ghost btn-small">
          <IconChevronLeft />
          Profil
        </Link>
      </div>
      <RecurringTemplates />
    </>
  );
}
