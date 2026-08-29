Fates Entwined landing website

How to use:
1. Push the desktop build to GitHub so the release workflow publishes the Windows installer.
2. The download buttons point to the official site path:
   /installer/Fates-Entwined-Installer.exe
3. The Fly server keeps that public URL stable and resolves it to the newest installer published by GitHub Releases.
4. The site uses the uploaded game backgrounds and profile art in the assets folder.

Files:
- index.html: page markup
- styles.css: page styling
- archive-data.js: generated card and lore archive data
- archive.js: card/lore tab behavior and detail windows
- assets/: images used by the page
- installer/: documents the official public installer path; the server resolves it to the newest release
