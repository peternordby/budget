import { redirect } from "next/navigation";

// Innsikt is three subpages; the tab lands on the first.
export default function InnsiktRedirect() {
  redirect("/innsikt/periode");
}
