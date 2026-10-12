# Firebase setup: accounts, cloud save and leaderboards

MineSurvive is a static site. Accounts, cloud saves and leaderboards use **Firebase** (Authentication +
Cloud Firestore) directly from the browser. Nothing here is required: a build without Firebase settings
plays fully offline with guest and local profiles.

This guide is written for someone who has never used Firebase. It takes about 15 minutes.

## What works without any configuration

| Feature | Without Firebase | With Firebase |
|---|---|---|
| Play, progress, upgrades, gacha | Yes (saved in this browser) | Yes |
| Play as guest | Yes | Yes |
| Local profile (name + avatar, no password, this device only) | Yes | Yes |
| Sign in with Google / email + password | Button disabled: "Cloud accounts are not configured on this deployment" | Yes |
| Same progress on several devices (cloud save) | No | Yes |
| Global leaderboards (day / week / all time, per hero filter) | Local list of your own bests | Yes |

Account types:

- **Guest**: anonymous. Progress lives only in this browser (`localStorage` key `minesurvive.save`). If the
  player later signs in, the game offers to bring that progress into the account.
- **Local profile**: a name and an avatar (hero) stored in this browser. No password, works offline. Uses
  the same device save as the guest.
- **Cloud account** (Google or email + password): has a unique public **nickname** (3-16 letters, digits or
  `_`). Progress is cached on the device (`minesurvive.save.<uid>`) and mirrored to Firestore.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. **Create a project** (any name, e.g. `minesurvive`). Google Analytics is not needed: you can turn it off.
3. The free **Spark** plan is enough.

## 2. Register a Web app and copy its config

1. In the project overview click the **Web** icon (`</>`), give it a nickname (e.g. `web`). Do **not**
   enable Firebase Hosting (the game is hosted on GitHub Pages).
2. Firebase shows a `firebaseConfig` object. Keep these values; you need five of them:

   | firebaseConfig field | Variable name |
   |---|---|
   | `apiKey` | `FIREBASE_API_KEY` |
   | `authDomain` | `FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `FIREBASE_PROJECT_ID` |
   | `appId` | `FIREBASE_APP_ID` |
   | `messagingSenderId` | `FIREBASE_MESSAGING_SENDER_ID` (optional) |

   You can find them again later under **Project settings > General > Your apps**.

These values are **public identifiers**, not secrets: they end up in the JavaScript every visitor downloads.
Security comes from the Firestore rules (step 5) and the authorized domains (step 3).

## 3. Enable sign-in providers and authorize your domain

1. **Build > Authentication > Get started**.
2. **Sign-in method** tab:
   - **Google**: enable it, choose a support email, save.
   - **Email/Password**: enable the first switch (Email/Password). Leave "Email link" off. Save.
3. **Settings > Authorized domains**: click **Add domain** and add your GitHub Pages domain, e.g.
   `<your-user>.github.io` (no `https://`, no path). `localhost` is already there for local development.
   If you use a custom domain, add it too.

## 4. Create the Firestore database

1. **Build > Firestore Database > Create database**.
2. Pick a location close to your players (it cannot be changed later).
3. Start in **production mode** (everything locked); the next step installs the real rules.

## 5. Install the security rules and indexes

Either way works:

**A. From the console (no tools needed)**

1. **Firestore Database > Rules**: replace everything with the contents of [`firestore.rules`](../firestore.rules)
   and click **Publish**.
2. **Firestore Database > Indexes > Composite > Create index**: collection ID `e`, fields `hero`
   Ascending and `timeSec` Descending, query scope **Collection**. (This powers the per-hero leaderboard
   filter; it takes a few minutes to build.) The same definition is in
   [`firestore.indexes.json`](../firestore.indexes.json).

**B. With the Firebase CLI**

```sh
npm install -g firebase-tools
firebase login
firebase use --add            # pick your project
firebase deploy --only firestore   # uses firebase.json -> firestore.rules + firestore.indexes.json
```

## 6. Give the config to the GitHub build

The deploy workflow reads repository **variables** (not secrets, because the values are public anyway).

1. On GitHub: your repository > **Settings > Secrets and variables > Actions > Variables** tab.
2. **New repository variable** for each of: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`,
   `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` and (optional) `FIREBASE_MESSAGING_SENDER_ID`, with the values
   from step 2.
3. Re-run the **Deploy to GitHub Pages** workflow (Actions tab > Deploy > Run workflow), or push to `main`.

`.github/workflows/deploy.yml` passes them to the build as `VITE_FIREBASE_*`. If any of the four required
values is missing, the build simply has no cloud features.

## 7. Local development

```sh
cp .env.example .env.local     # never commit .env.local (it is gitignored)
# fill in the VITE_FIREBASE_* values
npm run dev
```

`localhost` is an authorized domain by default, so Google sign-in works locally. Without `.env.local`
the game runs in local/guest mode. There is also an in-memory demo backend (no Firebase at all) that the
app can enable with `loadBackend({ memoryFallback: true })`, e.g. behind a `?cloud=memory&debug` URL parameter (this is what `main.ts` does):
it fakes Google/email accounts, nicknames, cloud saves and leaderboards inside this browser.

## 8. Check that it works

1. Open the deployed game, open the account screen, **Sign in with Google**.
2. Pick a nickname.
3. Play a run, wait a few seconds, then open **Firestore Database > Data**: you should see
   `saves/<uid>`, `profiles/<uid>`, `names/<nickname>`, `runs/<uid>` and `lb/time_all/e/<uid>`.
4. Open the game in another browser and sign in with the same account: the progress appears.

## How it works

### Modules (`src/net/`)

| Module | Role |
|---|---|
| `config.ts` | Reads `VITE_FIREBASE_*`; exports `firebaseConfig` and `cloudConfigured`. |
| `backend.ts` | `CloudBackend` interface and `loadBackend()`, which loads the Firebase SDK with a dynamic `import()` (its own chunk, about 170 kB gzipped, fetched only when cloud features are used). |
| `firebaseBackend.ts` | Firebase implementation (modular SDK: `firebase/app`, `firebase/auth`, `firebase/firestore`). |
| `memoryBackend.ts` | In-memory implementation with the same rules, for tests and demos. |
| `auth.ts` | `AuthService`: guest / local profile / cloud account, remembered session, friendly error codes. |
| `cloudSave.ts` | `CloudSaveStore`: the game's `SaveStore`, local-first with cloud sync and conflict handling. |
| `leaderboard.ts` | Board ids, cloud leaderboard service, local leaderboard. |
| `session.ts` | `bindSaveToAuth` (switches the save with the account) and `leaderboardFor`. |
| `src/ui/authOverlay.ts` | The HTML sign-in dialog and the save-conflict dialog. |

### Cloud save and conflicts

The device copy is always the source of truth for the running game; the cloud copy is a mirror.

- Every save is written to `localStorage` immediately, then pushed to `saves/{uid}` after 3 s without
  further changes (also when the tab is hidden or closed). Offline, pushes are retried with backoff
  (2 s, 4 s, ... up to 5 min) and immediately when the browser reports it is back online.
- Each cloud write carries a revision number `v` that must be exactly the previous one plus 1 (enforced by
  the rules). A device that is behind can never overwrite a newer cloud save: its write is rejected and it
  re-reads the cloud copy instead.
- On sign-in (and on demand) the game compares both copies:
  - only this device changed: upload it;
  - only the cloud changed: take the cloud copy (the device copy is first backed up to
    `<key>.pre-cloud.bak`);
  - both changed: the player chooses ("Keep this device" / "Use the cloud save"); the copy not chosen is
    kept as a backup on the device (`<key>.pre-cloud.bak` or `<key>.cloud.bak`). A side with no progress at
    all (no runs, pulls or companions) never triggers the question.
- **First sign-in on a device that has guest progress**: the game asks whether to bring it into the account
  ("Use this device's progress" / "Keep my account's save" or "Start fresh"). The guest save itself is never
  modified, and it is not offered again to the same account (`minesurvive.save.adoptedBy`).
- A cloud save written by a newer version of the game is never touched by an older one.

### Leaderboards and anti-cheat

Boards: `time_all`, `time_week_<yyyy-Www>` (ISO week, UTC) and `time_day_<yyyy-mm-dd>` (UTC). Each player has
one entry per board (`lb/{board}/e/{uid}`) with nickname, avatar, hero, time survived, kills and the server
time; it is only replaced by a better run (longer time, or the same time with more kills). The per-hero view
filters on the `hero` field.

Basic anti-cheat, enforced by the rules (a modified client cannot bypass it):

1. When a run starts, the client writes `runs/{uid}.startedAt` = the **server** time (`request.time`).
2. An entry is rejected if its `timeSec` is larger than the real time elapsed since `startedAt` plus 5 s,
   larger than 2 hours, or has more kills than `20 + 10 x timeSec`.
3. The entry's nickname must be the player's claimed nickname, and only the owner can write their entry.

Limits (documented honestly): this stops forged "I survived 3 hours" entries sent a minute after starting,
but a determined cheater can still mark a run start, wait in real time, and submit a time up to the elapsed
time. Stronger checks would need a server (Cloud Functions), which this static setup avoids.

### Security rules, one by one

Everything not listed below is denied (`match /{document=**} { allow read, write: if false; }`).

| Path | Read | Write | Why |
|---|---|---|---|
| `saves/{uid}` | Owner only | Owner only. Keys exactly `save`, `updatedAt`, `v`; `save` is a map with at most 40 top-level fields and an integer `saveVersion`; `updatedAt` must be the server time; `v` must be 1 on create and previous + 1 on update. Owner may delete. | Private progress; the revision check prevents lost updates between devices. |
| `names/{lower}` | `get` by anyone, no listing | Create only by a signed-in user for themselves (`{uid}` only), id must match `^[a-z0-9_]{3,16}$`, and the same write must set the user's profile to this nickname. Never updated. Deleted only by its holder and only when the profile no longer uses it (deleting a profile must release its nickname in the same write). | Unique nicknames; a player holds exactly one, so names cannot be squatted. The public `get` lets the sign-up form check availability before the account exists; it only reveals that a nickname is taken (and the holder's uid, which leaderboards show anyway). |
| `profiles/{uid}` | Signed-in users | Owner only. Keys exactly `nick`, `lower`, `avatar`, `at`; `nick.lower() == lower`; `lower` is a valid nickname the user holds (`names/{lower}.uid == uid` after the write); `avatar` up to 32 chars; `at` is the server time; renaming must delete the old `names` claim in the same write. | Public identity without exposing emails or real names. |
| `runs/{uid}` | Owner only | Owner only; only `startedAt`, which must equal the server time. | Server-side start time for the anti-cheat check (can only move forward, which only shrinks the allowed time). |
| `lb/{board}/e/{uid}` | Signed-in users | Owner only (document id = own uid); board id must match the allowed patterns; exact key set; `nick` equals the owner's profile nickname; `timeSec` integer 1-7200 and within the elapsed-time check; `kills` integer within the plausibility bound; `at` is the server time; updates must improve the previous entry. Owner may delete. | One honest best per player and board. |

The rules cannot be unit-tested in this repository (that needs the Firebase emulator). The in-memory
backend (`src/net/memoryBackend.ts`) mirrors them and the test suite (`tests/net-*.test.ts`) exercises that
mirror. If you have the Firebase CLI, `firebase emulators:start --only firestore,auth` plus the game in dev
mode is the best way to try changes to the rules.

## Privacy: what is stored

| Where | What |
|---|---|
| Firebase Authentication | Email address (email accounts and Google), display name from Google, sign-in timestamps. Managed by Google. Never shown to other players. |
| `saves/{uid}` | The game save: currencies, collection, upgrades, settings, statistics, missions, achievements, profile name/avatar. Only you can read it. |
| `profiles/{uid}`, `names/{nick}` | Your nickname and avatar (a hero id). Visible to signed-in players. |
| `lb/...` | Your nickname, avatar, hero, best time, kills and when it was set. Visible to signed-in players. |
| `runs/{uid}` | Server time of your last run start. Only you can read it. |
| This browser (`localStorage`) | The device save(s), the remembered session, the local profile, backups (`*.bak`). |

No analytics, ads or tracking are included. To delete an account's data, delete its documents in the
Firestore console and the user under Authentication > Users (an in-game "delete account" button is not
implemented yet).

## Hardening checklist (recommended before sharing the game publicly)

The rules stop forged writes to other players' data, but sign-up is open, so protect the project itself:

1. **Restrict the Web API key** (Google Cloud console > APIs & Services > Credentials) to HTTP referrers
   `https://<user>.github.io/*` and `http://localhost:*`, and to the Identity Toolkit and Firestore APIs.
   The key is public by design; the restriction stops reuse from other sites.
2. **Enable App Check** (reCAPTCHA v3) in *enforce* mode for Firestore and Authentication. This is the main
   defence against scripted account creation and quota exhaustion; it needs a small client change (not
   included yet, so enforce only after adding it).
3. **Set a budget alert** (Blaze) or watch the Spark quota (about 20k writes and 50k reads per day).
4. Turn on **Email Enumeration Protection** (Authentication > Settings).
5. Prefer a dedicated GitHub Pages origin (custom domain or a user/org site): all `github.io` project pages of one
   account share localStorage, IndexedDB (sign-in tokens) and the Cache API.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Cloud accounts are not configured on this deployment" | The build had no `VITE_FIREBASE_*` values. Check the repository variables (step 6) and re-run the deploy. |
| "This site is not authorized for sign-in yet" | Add the domain under Authentication > Settings > Authorized domains (step 3). |
| "This sign-in method is not enabled" | Enable Google / Email-Password (step 3). |
| Popup blocked | The game falls back to a full-page redirect. Allowing pop-ups for the site is smoother. Some browsers that block third-party storage can break the redirect flow when `authDomain` is `*.firebaseapp.com` and the game is on `github.io`; the popup flow is not affected. |
| "The server refused this change" | Rules not published, or a leaderboard entry failed the anti-cheat checks. |
| Per-hero leaderboard empty / error in the console about an index | Create the composite index (step 5) and wait until it is "Enabled". |
