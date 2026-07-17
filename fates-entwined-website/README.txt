Fates Entwined landing website

How to use:
1. Push the desktop build to GitHub so the release workflow publishes the Windows installer.
2. The download buttons point to:
   https://github.com/lianghoward14-debug/Fates-Entwined/releases/latest/download/Fates-Entwined-Installer.exe
3. The Fly server serves this site and the WebSocket authority; GitHub Releases serves the installer.
4. The site uses the uploaded game backgrounds and profile art in the assets folder.

Files:
- index.html: page markup
- styles.css: page styling
- archive-data.js: generated card and lore archive data
- archive.js: card/lore tab behavior and detail windows
- assets/: images used by the page
- installer/: legacy fallback installer copy; public website downloads use GitHub Releases
