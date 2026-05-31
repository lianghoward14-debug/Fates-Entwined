Fates Entwined landing website

How to use:
1. Deploy the project to Fly.io with the built Windows installer available in dist/.
2. The download buttons point to:
   https://fates-entwined-main.fly.dev/installer/Fates-Entwined-Installer.exe
3. The Fly server serves this site, the installer, and the WebSocket authority from one process.
4. The site uses the uploaded game backgrounds and profile art in the assets folder.

Files:
- index.html: page markup
- styles.css: page styling
- assets/: images used by the page
- installer/: stable public installer copy; Fly can also fall back to the latest dist build output
