# Private hosting on Cloudflare Pages

Puts the quotation app behind real authentication, so it is reachable by your
staff and by nobody else. Access authenticates at the **edge**, which is the
reason for choosing it: `data/catalog.csv`, `images/signature.png` and every
other file are protected, not just the user interface. A sign-in screen built
into the page could never do that — the files sit at predictable URLs and
anyone could fetch them directly.

Your CSV workflow does not change. Edit `data/catalog.csv`, commit, push, and
Cloudflare rebuilds in about thirty seconds.

## What gets deployed

`build-site.js` stages the app into `_site/`, and Pages publishes that rather
than the repository root. So the deploy carries the app and nothing else — not
the Electron build under `desktop/`, not the backup catalogues in `data/`, not
the dev-only `break-ui.html`.

The file list lives in `web-files.js` and is shared with the desktop build, so
a new file cannot reach one and quietly miss the other.

## 1. Create the Pages project

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git**, and pick the repository. **A private repository is fine** —
this is the main reason to prefer Pages over GitHub Pages, where going private
does not make the published site private.

Build settings:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `node build-site.js` |
| Build output directory | `_site` |
| Root directory | *(leave blank)* |

## 2. Add your domain

Pages project → **Custom domains** → add the domain, which must be on
Cloudflare DNS.

Use a custom domain rather than relying on the `*.pages.dev` address. Access
policies attach cleanly to a domain you control, and Cloudflare's handling of
Access on bare `pages.dev` production URLs has changed more than once — do not
build your only lock on it.

## 3. Put Access in front of it

Zero Trust dashboard → **Access** → **Applications** → **Add an application** →
**Self-hosted**, pointed at the domain from step 2.

- **Policy**: Allow, with **Emails** listing each staff address — or **Emails
  ending in** your company domain once you have one.
- **Identity provider**: **One-time PIN** needs no setup at all; Cloudflare
  emails a code. Google or GitHub work too.
- **Session duration**: set this **generously — a week or a month**. The app is
  built to work offline, and a short session means an expired login exactly
  when someone has no connectivity.

Free for up to 50 users at the time of writing.

## 4. Close the old door

**This is the step that actually makes the app private, and it is easy to
forget.** Repository **Settings → Pages → disable**. Until you do, the old
`github.io` URL keeps serving the app publicly and everything above achieves
nothing.

## 5. Tell Firebase about the new domain

Firebase console → **Authentication** → **Settings** → **Authorized domains** →
add the domain from step 2.

Miss this and Cloud Sync sign-in fails. The app already names the problem
precisely: *"This web address isn't authorised in Firebase yet."*

## Headers

`_headers` is copied into the deploy by `build-site.js`. It sets the usual
protective headers plus a Content-Security-Policy, and controls caching:
`sw.js` and `index.html` are always revalidated, so a deploy actually reaches
people; fonts and images are cached hard, because they only change by being
replaced with a differently named file.

The CSP is no stricter than the app can genuinely run under — see the comments
at the top of `_headers` for the three allowances that are load-bearing and why
tightening them would break the app rather than secure it. It was verified
against the running app with zero `securitypolicyviolation` events across the
catalogue, fonts, the Firebase SDK, images and quotation generation.

## Access and the service worker

Session expiry used to be able to poison the offline cache: a request for
`data/catalog.csv` would be answered with the Access login page, and the
service worker would store that HTML **as the catalogue**. `sw.js` now caches
only a final, same-origin, non-redirected `200`, so a login page, a challenge
and a redirect are all refused.

This is why the service-worker hardening had to land before Access, not after.

## Testing the headers locally

`_headers` is only interpreted by Cloudflare, so it is not exercised by a
plain local server. To check a change before pushing, serve `_site/` with
something that applies the rules, then confirm the app still loads the
catalogue and the fonts and that the console reports no CSP violations.
