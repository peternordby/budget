"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
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

// Routes whose data is not scoped to the selected month. /sparing records a
// balance observed on a given date and shows the whole history, so a period
// selection has nothing to act on there — rendering the picker would imply a
// filter that does not exist.
const ROUTES_WITHOUT_PERIOD = new Set(["/sparing"]);

function AppChrome({ children, email }: { children: ReactNode; email?: string | null }) {
  const pathname = usePathname();
  return (
    <>
      <TopNav email={email} />
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
        <LedgerProvider session={session}>
          <main className="shell">
            {/* useSearchParams (in TopNav, and later PeriodPicker) requires a
                Suspense boundary in the App Router. One boundary covers both
                TopNav and the page content. */}
            <Suspense fallback={null}>
              <AppChrome email={session.user.email}>{children}</AppChrome>
            </Suspense>
          </main>
        </LedgerProvider>
      )}
    </AuthGate>
  );
}
