// The page the app opens on: the entry form on a phone, where adding a
// purchase is what the app is opened for, and the dashboard elsewhere. 640px
// is where TopNav turns into the bottom tab bar, i.e. where the app considers
// itself on a phone. Client-only — the server cannot know the screen width.
export function homePath() {
  return window.matchMedia("(max-width: 640px)").matches
    ? "/transaksjoner"
    : "/oversikt";
}
