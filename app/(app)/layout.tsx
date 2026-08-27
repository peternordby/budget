"use client";

import { Suspense, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import EncryptionGate from "@/components/EncryptionGate";
import LedgerProvider, { useLedger } from "@/components/LedgerProvider";
import PeriodPicker from "@/components/PeriodPicker";
import TopNav from "@/components/TopNav";

// Moved from app/visualize/page.tsx, which rendered this directly under
// TopNav. A failed batched fetch otherwise renders as "no data" everywhere —
// empty table, empty category bars, no gauge — indistinguishable from a month
// with genuinely no spending. Lives in the layout, not either page, so both
// routes get it from one place.
function LedgerErrorBanner() {
  const ledger = useLedger();
  if (!ledger.error) return null;
  return (
    <div className="status">
      Kunne ikke hente data ({ledger.error}). Siden kan derfor vise
      ufullstendig informasjon.
    </div>
  );
}

// Routes whose data is not scoped to the selected month. /sparing records a
// balance observed on a given date and shows the whole history, and /profil is
// account settings rather than a view of the ledger at all — a period
// selection has nothing to act on in either, and rendering the picker would
// imply a filter that does not exist.
const ROUTES_WITHOUT_PERIOD = new Set(["/sparing", "/profil"]);

function AppChrome({ children, user }: { children: ReactNode; user: User }) {
  const pathname = usePathname();
  return (
    <>
      <TopNav user={user} />
      <LedgerErrorBanner />
      {!ROUTES_WITHOUT_PERIOD.has(pathname) ? <PeriodPicker /> : null}
      {children}
    </>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      {(session) => (
        // EncryptionGate sits above LedgerProvider because the provider's fetch
        // is useless without the key: it would decrypt nothing and every figure
        // in the app would render as 0.
        <EncryptionGate session={session}>
          <LedgerProvider session={session}>
            {/* One place decides how motion behaves. reducedMotion="user" makes
                every `motion` animation in the app respect the OS setting, so no
                component checks the media query itself — the mirror of the
                blanket prefers-reduced-motion override in globals.css that
                neutralises the CSS keyframes. */}
            <MotionConfig reducedMotion="user">
            <main className="shell">
              {/* useSearchParams (in TopNav, and later PeriodPicker) requires a
                  Suspense boundary in the App Router. One boundary covers both
                  TopNav and the page content. */}
              <Suspense fallback={null}>
                <AppChrome user={session.user}>{children}</AppChrome>
              </Suspense>
            </main>
            </MotionConfig>
          </LedgerProvider>
        </EncryptionGate>
      )}
    </AuthGate>
  );
}
