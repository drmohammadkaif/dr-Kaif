# Dr. Kaif

Study, gym, skin care and internship planner.
Works **offline**, installs on **Android, iPhone and iPad**, and syncs between your devices through **your own free Cloudflare account**.

Everything is already inside this folder. You do not need to edit any file.

---

## What you need (all free)

- A GitHub account
- A Cloudflare account (free plan)

---

## Step 1: Make an empty GitHub repository

1. Go to github.com and tap **New repository**.
2. Name: `dr-kaif`
3. Tick **Add a README file** (this is important, Codespaces needs it).
4. Tap **Create repository**.

## Step 2: Open it in Codespaces

1. In your new repository tap the green **Code** button.
2. Open the **Codespaces** tab and tap **Create codespace on main**.
3. Wait until the code editor opens in the browser.

## Step 3: Put the zip file in

1. Drag `dr-kaif.zip` from your phone/computer into the **file list on the left** side of Codespaces.
   (Or right click in the file list and choose **Upload**.)

## Step 4: Run these commands in the Terminal

Open the Terminal (menu **Terminal → New Terminal**) and paste this, then press Enter:

```bash
unzip -o dr-kaif.zip && rm dr-kaif.zip && git add -A && git commit -m "Dr. Kaif app" && git push
```

Same thing, shorter: `bash setup.sh dr-kaif.zip` (after unzipping once, or use the command above).

When it finishes without red errors, your code is on GitHub.

## Step 5: Connect Cloudflare (this builds and publishes the app)

1. Go to dash.cloudflare.com and log in.
2. Open **Workers & Pages** → **Create application** → **Import a repository** (connect to GitHub and allow access to the `dr-kaif` repository).
3. Choose the `dr-kaif` repository.
4. **Worker name: `dr-kaif`** (it must be exactly this).
5. Leave every other box as it is (no build command is needed). Tap **Deploy**.
6. Wait for **Success**. Cloudflare shows your link, like `https://dr-kaif.YOURNAME.workers.dev`.

The database is created for you during this step (it is called `dr-kaif-db`; you can see it under **Storage & Databases → D1**). The tables inside it are created automatically the first time the app talks to it.

From now on, every time you push a change to GitHub, Cloudflare updates the app by itself.

## Step 6: Install on your phone or iPad

- **Android (Chrome):** open your link → menu (three dots) → **Install app**.
- **iPhone / iPad:** open your link in **Safari** → Share button → **Add to Home Screen**.
- **Computer (Chrome / Edge):** install icon at the end of the address bar.

After installing, the app opens full screen and works with no internet.

## Step 7: Turn on sync (optional but recommended)

1. In the app open **Settings → Cloud sync & backup → Create sync code**.
2. Write the code down (20 letters and numbers). Keep it private.
3. On your other device open the same link → **Settings → I already have a code**, type the code, and choose **Use the cloud data**.

Your data is encrypted on your device before it is uploaded. Nobody, not even Cloudflare or GitHub, can read it without your code.
**If you lose the code, the cloud copy cannot be opened.** Your data on your devices stays safe, and you can make a new code any time.

---

## Good to know

- **Offline:** everything works with no internet. Changes are saved on the device and sync later by themselves.
- **Screen sizes:** the layout adapts to phones, iPads and computers. Nothing should be cut off or need sideways scrolling.
- **Photos and PDFs:** kept on the device and also synced (encrypted). Keep each file under 3 MB.
- **iPhone note:** Safari can clear website data if a normal web page is not used for weeks. Installing to the Home Screen and turning on sync avoids this.
- **Free limits:** more than enough for personal use (Cloudflare Workers free plan, D1 free storage, GitHub free).
- **Backup:** Settings → Data & safety → Export / Copy gives you a full backup text you can keep anywhere.
- **Change the logo:** Settings → Appearance → App logo → Upload.

## If something goes wrong

- **Cloudflare says the database or a binding is missing:** in Cloudflare open **Storage & Databases → D1 → Create database**, name it `dr-kaif-db`. Then open your Worker → **Settings → Bindings → Add → D1 database**, variable name `DB`, choose `dr-kaif-db`. Deploy again.
- **The Worker name does not match:** in the Worker settings (Builds) make sure the name is `dr-kaif`.
- **Cloud sync says "not available":** you opened the app from a different address (for example a plain GitHub Pages link). Open your `workers.dev` link instead.
- **App looks old after an update:** close it fully and open it again once while online.

## For developers (optional)

```bash
node --test tests/worker.test.mjs     # Worker tests (no network needed)
node tests/dev-server.mjs             # run the app + API locally on http://127.0.0.1:8788
npx wrangler dev                      # run exactly like Cloudflare
```

Files: `public/` is the app, `src/worker.js` is the sync API, `wrangler.jsonc` is the Cloudflare config.
