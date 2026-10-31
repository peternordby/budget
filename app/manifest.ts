import type { MetadataRoute } from "next";

// Makes the site installable ("Legg til på Hjem-skjerm" / "Installer app").
// No service worker: iOS does not need one to install, and every read goes to
// Supabase anyway, so the app needs a connection exactly as the site does.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Regnskap",
    short_name: "Regnskap",
    description: "Personlig budsjett og regnskap",
    lang: "nb",
    // "/" picks the start page by screen width (lib/home.ts).
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2f2f5",
    theme_color: "#f2f2f5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Full-bleed background with the coins inside the central 80%, so the
      // same file survives Android's mask.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
