# E-postmaler

Four templates, matching the app's look: sand background, white card, burnt
orange action. Paste each into **Authentication → Emails** in the Supabase
dashboard — they are not deployed by the app, so this directory is only here
to keep them in version control and re-pasteable.

| File | Dashboard template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | `Bekreft e-postadressen din` |
| `invite.html` | Invite user | `Du er invitert til Regnskap` |
| `reset-password.html` | Reset password | `Sett nytt passord` |
| `change-email.html` | Change email address | `Bekreft ny e-postadresse` |

**Two link shapes, on purpose.**

`invite.html` and `reset-password.html` build their own link:

    {{ .SiteURL }}/nytt-passord?token_hash={{ .TokenHash }}&type=invite|recovery

`/nytt-passord` calls `verifyOtp` with that hash. This shape puts no session
in a URL fragment and does not depend on a fragment surviving a redirect.

`confirm-signup.html` and `change-email.html` use plain `{{ .ConfirmationURL }}` instead. Nothing in
the app calls `verifyOtp` for a signup — the confirmation is verified by
Supabase's own `/auth/v1/verify` endpoint, which then redirects to the
`emailRedirectTo` that `app/registrer/page.tsx` passes (`/logg-inn`). Giving
it a `token_hash` link would need a page that exchanges it, which would be a
route existing only to do what Supabase already does.

**Change email sends two messages, not one.** Supabase's "Secure email change"
is on by default: the same template goes to the current address and the new
one, and the change applies only when both are confirmed. That is why the copy
is written to make sense in either inbox, and why `/profil` says so after
submitting — otherwise the field looks saved while nothing has changed.

**Not translated:** Magic Link and Reauthentication. Nothing in the app calls
`signInWithOtp` or `reauthenticate`, so those templates cannot fire. Translate
them when a flow starts using them, not before.

**Constraints these are written to.** Inline styles on every element (several
clients drop `<style>`), tables rather than flex or grid, solid hex rather
than `rgba()` or CSS variables, and a system font stack — Schibsted Grotesk
will not load in an inbox, so there is no point declaring it. The button is a
table cell with its own `bgcolor` so Outlook's Word renderer still paints it,
and the raw URL is repeated as text underneath for clients that mangle the
button entirely.
