import AuthPanel from "@/components/AuthPanel";

// A sibling of the (app) route group, so it is never wrapped by AuthGate —
// which is what lets it render for someone with no session.
export default function LoggInnPage() {
  return <AuthPanel />;
}
