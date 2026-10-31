"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homePath } from "@/lib/home";

// Also the installed app's start_url (app/manifest.ts), so a phone opens
// straight onto /transaksjoner.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(homePath());
  }, [router]);
  return null;
}
