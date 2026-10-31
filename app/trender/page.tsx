import { redirect } from "next/navigation";

// Moved under Innsikt; kept for old links.
export default function TrenderRedirect() {
  redirect("/innsikt/trender");
}
