// P2-1 mobile acceptance (spec PLANS/AWA_TWINS_PHASE2_SPEC_2026-09-24.md,
// Robin voice note 23 Sep): live geometry, not code presence.
//  Mobile: dismiss control; open = bottom SHEET pinned to viewport bottom,
//  subscribe bar hidden, input inside viewport, no page-scroll jump; Escape
//  closes and restores the bar; body reserve never double-counts across
//  resize cycles. Desktop: unchanged fixed pill, bar stays visible.
import { chromium } from "playwright";
const URL = process.env.P2_URL ?? "http://localhost:8641/";
let failures = 0;
const fail = (m) => { failures++; console.log("FAIL: " + m); };
const pass = (m) => console.log("PASS: " + m);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const browser = await chromium.launch();

// --- Mobile 390px ---
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(300);

  const widget = page.locator("#twinsWidget");
  if (await widget.isVisible()) pass("390: dock visible collapsed");
  else fail("390: dock not visible");

  // 1. Dismiss control present and hides the dock for the session.
  const dismiss = page.locator("#twinsWidget .twins-dismiss");
  if ((await dismiss.count()) === 1) pass("390: dismiss control present");
  else fail("390: dismiss control missing");
  await dismiss.click();
  await page.waitForTimeout(100);
  const hidden = await widget.evaluate((el) => el.classList.contains("twins-hidden"));
  const stored = await page.evaluate(() => sessionStorage.getItem("awTwinsDockDismissed"));
  if (hidden && stored === "1") pass("390: dismiss hides dock + session key set");
  else fail(`390: dismiss state hidden=${hidden} stored=${stored}`);
  // Reload: still hidden within the same session.
  await page.reload();
  await page.waitForTimeout(300);
  if (!(await page.locator("#twinsWidget").isVisible())) pass("390: dock stays hidden after reload (same session)");
  else fail("390: dock reappeared after reload in same session");
  await ctx.close();

  // Fresh session: dock returns.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await ctx2.newPage();
  await page2.goto(URL);
  await page2.waitForTimeout(300);
  if (await page2.locator("#twinsWidget").isVisible()) pass("390: dock restored in a fresh session");
  else fail("390: dock lost across sessions");

  // 2. Open = bottom sheet: pinned to viewport bottom, subscribe bar hidden,
  //    input inside viewport, page does NOT scroll to mid-page.
  const beforeY = await page2.evaluate(() => window.scrollY);
  await page2.locator("#twinsWidget .twins-bar").click();
  await page2.waitForTimeout(250);
  const sheet = await page2.evaluate(() => {
    const w = document.getElementById("twinsWidget");
    const r = w.getBoundingClientRect();
    const bar = document.querySelector(".subscribe-bar");
    const input = w.querySelector(".twins-input").getBoundingClientRect();
    return {
      hasSheetClass: w.classList.contains("twins-open-sheet"),
      bottomGap: window.innerHeight - r.bottom,
      barHidden: !bar || getComputedStyle(bar).display === "none",
      inputInViewport: input.top >= 0 && input.bottom <= window.innerHeight && input.left >= 0 && input.right <= window.innerWidth,
      heightOk: r.height <= window.innerHeight * 0.85 + 2,
    };
  });
  if (sheet.hasSheetClass) pass("390: open state is the bottom sheet class");
  else fail("390: open state is not the bottom sheet");
  if (near(sheet.bottomGap, 0, 2)) pass("390: sheet pinned to viewport bottom");
  else fail(`390: sheet bottom gap ${sheet.bottomGap}px`);
  if (sheet.barHidden) pass("390: subscribe bar hidden while sheet open");
  else fail("390: subscribe bar still visible under the sheet");
  if (sheet.inputInViewport) pass("390: input fully inside the viewport, zero scroll");
  else fail("390: input outside the viewport");
  if (sheet.heightOk) pass("390: sheet height within 85dvh cap");
  else fail("390: sheet taller than 85dvh");
  const afterY = await page2.evaluate(() => window.scrollY);
  if (near(beforeY, afterY, 2)) pass("390: opening does not scroll the page (no scrollIntoView)");
  else fail(`390: page scrolled on open: ${beforeY} -> ${afterY}`);

  // 3. Escape closes and restores the subscribe bar.
  await page2.keyboard.press("Escape");
  await page2.waitForTimeout(200);
  const closed = await page2.evaluate(() => {
    const w = document.getElementById("twinsWidget");
    const bar = document.querySelector(".subscribe-bar");
    return {
      sheetOff: !w.classList.contains("twins-open-sheet"),
      barBack: bar && getComputedStyle(bar).display !== "none",
      collapsedVisible: getComputedStyle(w).display !== "none",
    };
  });
  if (closed.sheetOff && closed.barBack && closed.collapsedVisible) pass("390: Escape closes sheet, bar restored, dock back");
  else fail(`390: close state ${JSON.stringify(closed)}`);

  // 4. Body reserve never double-counts across resize cycles (P0 rider).
  const pad1 = await page2.evaluate(() => document.body.style.paddingBottom);
  await page2.setViewportSize({ width: 390, height: 700 });
  await page2.waitForTimeout(150);
  await page2.setViewportSize({ width: 390, height: 844 });
  await page2.waitForTimeout(150);
  const pad2 = await page2.evaluate(() => document.body.style.paddingBottom);
  const padPx1 = parseFloat(pad1) || 0, padPx2 = parseFloat(pad2) || 0;
  if (padPx2 <= padPx1 + 2) pass(`390: body reserve stable across resize cycles (${padPx1} -> ${padPx2})`);
  else fail(`390: body reserve grew across resize: ${padPx1} -> ${padPx2} (double-count)`);
  const sheetPad = await page2.evaluate(() => {
    const w = document.getElementById("twinsWidget");
    w.querySelector(".twins-bar").click();
    return new Promise((res) => setTimeout(() => res({ open: w.classList.contains("twins-open-sheet"), pad: document.body.style.paddingBottom }), 250));
  });
  if (sheetPad.open && (parseFloat(sheetPad.pad) || 0) <= padPx1 + 2) pass("390: reserve unchanged while sheet open (cached collapsed height)");
  else fail(`390: reserve misbehaves while sheet open: ${JSON.stringify(sheetPad)}`);
  await page2.keyboard.press("Escape");
  await ctx2.close();
}

// --- Desktop 1280px: unchanged fixed pill ---
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL);
  await page.waitForTimeout(300);
  await page.locator("#twinsWidget .twins-bar").click();
  await page.waitForTimeout(250);
  const desk = await page.evaluate(() => {
    const w = document.getElementById("twinsWidget");
    const bar = document.querySelector(".subscribe-bar");
    const cs = getComputedStyle(w);
    const r = w.getBoundingClientRect();
    return {
      noSheetClass: !w.classList.contains("twins-open-sheet"),
      fixedPill: cs.position === "fixed" && r.width <= 360 + 2,
      barVisible: bar && getComputedStyle(bar).display !== "none",
    };
  });
  if (desk.noSheetClass && desk.fixedPill && desk.barVisible) pass("1280: desktop unchanged — fixed pill, bar visible when open");
  else fail(`1280: desktop drift: ${JSON.stringify(desk)}`);

  // Oksana stamp 24 Sep (required-fix regression guard): /twins has NO
  // subscribe bar — the pill must keep its CSS-default 74px breathing gap,
  // never flush against the viewport bottom.
  await page.goto(URL.replace(/\/$/, "") + "/twins/");
  await page.waitForTimeout(300);
  await page.locator("#twinsWidget .twins-bar").click();
  await page.waitForTimeout(250);
  const twinsDesk = await page.evaluate(() => {
    const w = document.getElementById("twinsWidget");
    const r = w.getBoundingClientRect();
    return { gap: window.innerHeight - r.bottom, inline: w.style.bottom };
  });
  if (Math.abs(twinsDesk.gap - 74) <= 2) pass(`1280 /twins: pill keeps the 74px gap (actual ${twinsDesk.gap}, inline "${twinsDesk.inline}")`);
  else fail(`1280 /twins: pill gap ${twinsDesk.gap}px (inline "${twinsDesk.inline}") — flush-bottom regression`);
  // Close: /twins must also close cleanly (Escape) with the bar absent.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const twinsClosed = await page.evaluate(() => !document.getElementById("twinsWidget").classList.contains("twins-open-sheet"));
  if (twinsClosed) pass("1280 /twins: Escape closes the sheet");
  else fail("1280 /twins: sheet stuck open after Escape");
  await page.close();
}

await browser.close();
console.log(failures === 0 ? "P2 MOBILE PROBE: ALL PASS" : `P2 MOBILE PROBE: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
