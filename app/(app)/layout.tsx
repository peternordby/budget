"use client";

import { Suspense, type ReactNode } from "react";
import AuthGate from "@/components/AuthGate";
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

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      {(session) => (
        <LedgerProvider session={session}>
          <main className="shell">
            {/* useSearchParams (in TopNav, and later PeriodPicker) requires a
                Suspense boundary in the App Router. One boundary covers both
                TopNav and the page content. */}
            <Suspense fallback={null}>
              <TopNav email={session.user.email} />
              <LedgerErrorBanner />
              <PeriodPicker />
              {children}
            </Suspense>
          </main>
        </LedgerProvider>
      )}
    </AuthGate>
  );
}
