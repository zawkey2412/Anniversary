# ✉ Moonlight Courier: a first-anniversary gift

A small 3D browser game for Ay Yüzlüm. She carries a glowing 💜 message 9,571 km from Istanbul to Bandung under the moon. Along the way she collects stars, avoids clouds, and flies through rings that open memories, *guess the number* questions and *guess the song* questions. When she lands, the letter and the video appear.

Plain HTML, CSS and JS with Three.js included in the repo. There is no build step, so it runs as is on GitHub Pages.

## Files

| Path | What it is |
|---|---|
| `index.html` | The site she opens |
| `editor.html` | **Your** editor (texts, photos, song clips, music, video, publish) |
| `content.json` | Every text, quiz and media path. The editor writes this file. |
| `media/` | Uploaded photos, audio and video |
| `js/world.js` | 3D scene and game |
| `js/main.js` | Flow: gate → chat intro → game → checkpoints → finale |
| `assets/` | Three.js, the dotted-globe land data, and sound effects |

## 1. Put it online (GitHub Pages, one time)

1. Repo **Settings → Pages**.
2. *Source*: **Deploy from a branch** → choose the branch with this code, folder **/ (root)** → Save.
3. After about a minute the site is at `https://zawkey2412.github.io/Anniversary/`.
   The editor is at `https://zawkey2412.github.io/Anniversary/editor.html`. Don't send her that one.

> GitHub Pages on a free account needs a **public** repo, so anyone who finds the repo can read `content.json`.
> The password gate is only a cute lock. Don't put anything truly private in it.

## 2. Fill in the content (editor)

1. Open `editor.html` (on the live site, or locally, see below).
2. Change texts, **upload photos** (resized automatically), **song clips** (10–20 s mp3/m4a), optional **background music**, and the **final video**.
   - Video: an `.mp4` under ~40 MB uploads fine. For bigger files, upload to YouTube as **Unlisted** (or Google Drive with "anyone with the link") and paste the link.
3. Click **👀 Preview** to play your unpublished version. The dropdown lets you jump straight to the game or the finale.
4. Click **Publish 💜**. The first time, create a fine-grained token (the steps are in the editor) with *Contents: Read and write* on this repo only.
   Everything goes up in one commit, and Pages updates about a minute later.

Drafts auto-save in your browser. Uploaded files that you haven't published yet are lost if you close the tab, so publish before closing.

## Run locally

```bash
python3 -m http.server 8000
# site:   http://localhost:8000/
# editor: http://localhost:8000/editor.html
# shortcuts: /?jump=game  /?jump=finale
```

## Password

Any of `content.json → settings.passwords` works, written any way she likes: `08.11`, `8/11`, `0811`, `09.11.2025`, …

## Credits

Sound effects: [Kenney](https://kenney.nl) Interface, RPG and Impact sound packs, CC0 (public domain). See `assets/sfx/LICENSE-kenney-CC0.txt`.
Fonts: Caveat, Lora, Special Elite (Google Fonts, OFL).
