# Privacy

Media Transfer copies files from your camera cards to your drives. It never uploads your files,
and it sends nothing about them. If you agree, it sends a small set of anonymous usage stats
that show how the app is used and where it fails. It works exactly the same if you say no.

## You choose

The first time you open Media Transfer it asks: **"Help improve Media Transfer?"** with two
equal buttons, **Send anonymous stats** and **No thanks**. Closing the question without
choosing counts as **No thanks**. Until you agree, nothing is sent.

You can change your answer any time: click the **gear** in the top bar and switch **Send
anonymous usage stats** on or off. Turning it off also deletes the stats that were waiting to be
sent.

## What is sent, if you agree

Each install has a random anonymous id (a UUID created on your Mac, not linked to you,
your Mac or your Apple account). Every message carries that id, the app version, and your Mac's
platform, macOS version and processor type (`{ installId, app: { name, version }, os: { platform,
release, arch }, sentAt, events }`). The events are exactly these:

| Event | When | What it contains |
|---|---|---|
| `app_launched` | The app starts | App version, macOS version, Mac type (arch), language setting (locale), number of drive profiles |
| `transfer_started` | You start a transfer | Number of folders, number of files and bytes to copy, whether flatten is on |
| `transfer_finished` | A transfer ends | Files copied, verified, skipped and failed; bytes; duration in ms; speed in MB/s |
| `transfer_failed` | A transfer could not run | The stage (scan or copy) and an error code (such as `ENOSPC`), never the error message, because a message can contain a path |
| `transfer_cancelled` | You cancel a transfer | Bytes done, duration |
| `update_available` / `update_installed` | An update is found / was installed | The version |
| `telemetry_toggled` | You turn the stats on | The new state (`on`) |

Nothing else, ever.

## What is never sent

- File names, folder names or paths
- Volume or drive names, card or camera names, profile labels
- Your user name or your computer's name
- Your location. The server does not store your IP address.
- The contents of any file

## When and where

Stats are kept in a small queue on your Mac (`telemetry-queue.json`, at most 500 events) and sent
in batches when the app starts, after each transfer and when it quits. If your Mac is offline,
they wait and are sent later; the app never waits for them.

They go to `https://media-transfer-api.buildsomethingeveryday.com`, a server in Eddy Varela's
own AWS account, where they are **kept indefinitely** (they are the source of truth for the
app's usage numbers). From there they are forwarded to **PostHog** (US Cloud), an analytics
service, where they are kept for **1 year**. They are not sold or shared with anyone else.

## Reset your anonymous id

Gear -> **Reset anonymous id**. The app makes a new random id; stats sent afterwards can't be
connected to the ones sent before.

## Other network use

The only other network call is the **update check**: when **Check for updates automatically**
is on (gear), the app asks GitHub Releases (`github.com/eddyvarelae/media-transfer`) every 6 hours
whether a newer version exists, and downloads it in the background. Turn the switch off to stop
it. Nothing else leaves your Mac.

## Short version

- Media Transfer never uploads your files or anything about them.
- If you agree, it sends anonymous usage stats: app and macOS version, Mac type, language, and
  counts, sizes and durations of transfers. Never file names, paths or drive names.
- You're asked once; "No thanks" means nothing is sent. Change it any time from the gear.
- Stats go to the developer's own server (kept indefinitely) and PostHog analytics (1 year).
- The only other network call is the optional update check against GitHub.
- You can reset your anonymous id from the gear at any time.
