# Piano Logger — Official Product Website

Independent static promotional site for Piano Logger. It is a separate project: it never modifies the Piano Logger app or its GitHub Pages site, and only links to the official destinations.

## Files
- `index.html` — all sections (hero, preview, feature carousel, comparison, downloads, version archive, about, help, contact)
- `css/styles.css`, `js/main.js`, `favicon.svg` — no dependencies, no build step

## Run locally
```
cd Piano-Logger-Official-Website
python -m http.server 8321
```
Open http://localhost:8321/ (opening index.html directly also works; the GitHub API needs internet).

## Host
Any static host works (GitHub Pages: push this folder as its own repository and enable Pages; Netlify/Vercel: deploy the folder as-is).

## Live data
`js/main.js` calls `https://api.github.com/repos/kosandra0/Piano_Logger/releases?per_page=100` once per 10 minutes (cached in sessionStorage; the unauthenticated limit is 60 requests/hour per IP). Latest-release card, download URL (`browser_download_url`), SHA-256 and the archive all come from it. If the API fails, an error state links to the official releases page and the download button falls back to `releases/latest/download/Piano-Logger-Setup.exe`.

## Notes
- Mockups use demonstration data and are labelled as such; they are not screenshots.
- The "Windows app unchanged" notice is detected from the release notes text ("Windows app is the same as X").

## Polish pass (2026-11-11)
Comic Sans MS is the global font (`--font` in `css/styles.css`; code and keyboard-shortcut tokens stay monospace). Motion is calm and pauses off-screen / when the tab is hidden; `prefers-reduced-motion` removes it. Contact section has social cards (Telegram, Instagram, Discord) with Clipboard API copy buttons.
