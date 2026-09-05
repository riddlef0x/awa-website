// P0 mobile acceptance (Jane brief + Oksana receipt standard, 5 Sep 2026):
// real viewports 390px AND 360px; live geometry (bounding boxes, not code
// presence): the OPEN twins panel must not intersect any content element;
// keyboard open/close; nav + CTA counts; desktop unchanged (fixed pill).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.html");
const URL = process.env.P0_URL ?? "http://localhost:8641/";
let failures = 0;
const fail = (m) => { failures++; console.log("FAIL: " + m); };
const pass = (m) => console.log("PASS: " + m);

const browser = await chromium.launch();

for (const [name, width, height] of [["iPhone 390px", 390, 844], ["Android 360px", 360, 740]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(URL);
  await page.waitForTimeout(300);

  // 1. Nav: Episodes, Blog, About all present and visible in header.
  for (const label of ["Episodes", "Blog", "About"]) {
    const link = page.locator("header .nav-ctas a", { hasText: label }).first();
    if (await link.isVisible()) pass(`${name}: header nav has ${label}`);
    else fail(`${name}: header nav missing ${label}`);
  }

  // 2. Home articles section gone; one-line blog link present.
  if ((await page.locator("#articles").count()) === 0) pass(`${name}: home READ section removed`);
  else fail(`${name}: home still has #articles section`);
  if ((await page.locator('main a[href="/articles/"]').count()) >= 1) pass(`${name}: blog one-line link present`);
  else fail(`${name}: no blog link on home`);

  // 3. Yoshi gate #5: served HTML carries exactly ONE "Subscribe on YouTube"
  // CTA (hero) plus exactly ONE persistent listen-on block (footer).
  const subTotal = await page.locator("a", { hasText: "Subscribe on YouTube" }).count();
  if (subTotal === 1) pass(`${name}: exactly 1 "Subscribe on YouTube" CTA in served HTML`);
  else fail(`${name}: ${subTotal} "Subscribe on YouTube" CTAs in served HTML (want 1)`);
  const listenBlocks = await page.locator(".listen-on").count();
  if (listenBlocks === 1) pass(`${name}: exactly 1 persistent listen-on block`);
  else fail(`${name}: ${listenBlocks} listen-on blocks (want 1)`);

  // 4. Widget collapsed state on mobile: docked (fixed above the bottom bar)
  // per the Jane/Kate ruling — always visible, one ticker line.
  const pos = await page.locator("#twinsWidget").evaluate((el) => getComputedStyle(el).position);
  if (pos === "fixed") pass(`${name}: collapsed twins bar is docked (position:fixed)`);
  else fail(`${name}: collapsed twins bar position is ${pos}, want fixed (docked)`);

  // 4b. CLOSED docked bar at max scroll: reserved body padding means the last
  // content ends above the dock (nothing permanently hidden).
  const reserved = await page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    const w = document.getElementById("twinsWidget");
    const b = w.querySelector(".twins-ask").getBoundingClientRect();
    const out = [];
    document.querySelectorAll("main h1, main h2, main h3, main p, main a, main img").forEach((el) => {
      if (w.contains(el)) return;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const ix = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left));
      const iy = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
      if (ix * iy > 1) out.push(el.tagName + "." + el.className);
    });
    return out;
  });
  if (reserved.length === 0) pass(`${name}: closed dock covers nothing at max scroll (reserved space)`);
  else fail(`${name}: closed dock overlaps content at max scroll: ${reserved.slice(0, 5).join(", ")}`);

  // 4c. Oksana's fixed-overlay trap (PR #106 lesson): no ancestor of the
  // widget may carry transform/backdrop-filter/filter/contain — a fixed
  // element inside one collapses to that ancestor's box at some widths.
  const badAncestor = await page.evaluate(() => {
    let el = document.getElementById("twinsWidget").parentElement;
    while (el && el !== document.documentElement) {
      const st = getComputedStyle(el);
      if (st.transform !== "none" || (st.backdropFilter && st.backdropFilter !== "none") || (st.filter && st.filter !== "none") || st.contain !== "none") return el.tagName + "." + el.className;
      el = el.parentElement;
    }
    return null;
  });
  if (!badAncestor) pass(`${name}: widget has no filtered/transformed ancestor (fixed-position safe)`);
  else fail(`${name}: widget ancestor ${badAncestor} breaks fixed positioning`);

  // 5. Keyboard open (focus bar + Enter), then live geometry at several scrolls.
  await page.locator(".twins-bar").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const expanded = await page.locator(".twins-bar").getAttribute("aria-expanded");
  if (expanded === "true") pass(`${name}: keyboard Enter opens the panel`);
  else fail(`${name}: keyboard Enter did not open panel (aria-expanded=${expanded})`);

  for (const scrollY of [0, 800, 1600, 2400]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), scrollY);
    await page.waitForTimeout(80);
    const hits = await page.evaluate(() => {
      const widget = document.getElementById("twinsWidget");
      const panel = widget.querySelector(".twins-ask");
      const p = panel.getBoundingClientRect();
      if (p.width === 0 || p.height === 0) return ["panel has no box"];
      const out = [];
      document.querySelectorAll("main h1, main h2, main h3, main p, main a, main img").forEach((el) => {
        if (widget.contains(el)) return;
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const ix = Math.max(0, Math.min(r.right, p.right) - Math.max(r.left, p.left));
        const iy = Math.max(0, Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top));
        if (ix * iy > 1) out.push(el.tagName + "." + el.className + " " + Math.round(ix * iy) + "px2");
      });
      return out;
    });
    if (hits.length === 0) pass(`${name}: open panel intersects nothing (scrollY=${scrollY})`);
    else fail(`${name}: open panel overlaps content at scrollY=${scrollY}: ${hits.slice(0, 5).join(", ")}`);
  }

  // 6. Keyboard close.
  await page.locator(".twins-bar").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const closed = await page.locator(".twins-bar").getAttribute("aria-expanded");
  if (closed === "false") pass(`${name}: keyboard Enter closes the panel`);
  else fail(`${name}: keyboard Enter did not close panel (aria-expanded=${closed})`);

  // 6b. Escape closes the open panel (Yoshi gate #2) and re-docks.
  await page.locator(".twins-bar").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const escClosed = await page.locator(".twins-bar").getAttribute("aria-expanded");
  const reDocked = await page.locator("#twinsWidget").evaluate((el) => !el.classList.contains("twins-undocked"));
  if (escClosed === "false" && reDocked) pass(`${name}: Escape closes the panel and re-docks`);
  else fail(`${name}: Escape close failed (aria-expanded=${escClosed}, undocked=${!reDocked})`);

  // 7. Open panel reachable: scrolling to it brings the bar into view and the
  // panel stays horizontally inside the viewport (in-flow content may extend
  // below the fold — that is normal document behaviour, not an overlay).
  const reach = await page.evaluate(({ width }) => {
    const widget = document.getElementById("twinsWidget");
    widget.scrollIntoView({ block: "start" });
    const p = widget.querySelector(".twins-ask").getBoundingClientRect();
    return { hOK: p.left >= 0 && p.right <= width + 1, barTop: widget.querySelector(".twins-bar").getBoundingClientRect().top };
  }, { width });
  if (reach.hOK && reach.barTop >= 0) pass(`${name}: open panel reachable by scroll, horizontally inside viewport`);
  else fail(`${name}: open panel not properly reachable: ${JSON.stringify(reach)}`);
  await page.close();
}

// 8. Desktop unchanged: floating pill, fixed.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL);
  const pos = await page.locator("#twinsWidget").evaluate((el) => getComputedStyle(el).position);
  if (pos === "fixed") pass("desktop 1280px: widget still fixed pill (unchanged)");
  else fail(`desktop: widget position ${pos}, want fixed`);
  await page.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL P0 MOBILE CHECKS PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
