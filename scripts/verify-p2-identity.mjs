// P2-2 identity acceptance (Oksana stamp 24 Sep + Yoshi verify slice):
// live behavior, not code presence. Avatar toggles replace the dropdown;
// at-least-one invariant (both out = Ask disabled + visible hint, no silent
// coercion); rendered labels byte-match the map's of-record value at probe
// time (interim "Tobi" per the locked register rule, event 1e2bd303);
// sessionStorage dismiss flag stays a single boolean.
import { chromium } from "playwright";
const URL = process.env.P2_URL ?? "http://localhost:8641/";
let failures = 0;
const fail = (m) => { failures++; console.log("FAIL: " + m); };
const pass = (m) => console.log("PASS: " + m);
const EM = "\u2014";

const browser = await chromium.launch();
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL);
  await page.waitForTimeout(300);
  await page.locator("#twinsWidget .twins-bar").click();
  await page.waitForTimeout(250);

  // 1. Avatars replace the dropdown; both on by default.
  const avatars = page.locator("#twinsWidget .twins-avatar");
  if ((await avatars.count()) === 2) pass("390: two avatar toggles present");
  else fail("390: avatar toggles wrong count");
  if ((await page.locator("#twinsWidget .twins-addressee").count()) === 0) pass("390: dropdown fully removed");
  else fail("390: dropdown still present");
  const pressed = await page.locator("#twinsWidget .twins-avatar").evaluateAll(
    (els) => els.map((e) => e.getAttribute("aria-pressed")));
  if (pressed.join(",") === "true,true") pass("390: both twins on by default");
  else fail(`390: initial aria-pressed ${pressed}`);
  const enabled = await page.evaluate(() => {
    const w = document.getElementById("twinsWidget");
    return { input: !w.querySelector(".twins-input").disabled, go: !w.querySelector(".twins-go").disabled,
      hintHidden: w.querySelector(".twins-hint").hidden };
  });
  if (enabled.input && enabled.go && enabled.hintHidden) pass("390: ask enabled, hint hidden at default state");
  else fail(`390: default state wrong: ${JSON.stringify(enabled)}`);

  // 2. Toggle Robin off — one twin on, still askable, no hint.
  await avatars.first().click();
  await page.waitForTimeout(100);
  const oneOff = await page.locator("#twinsWidget .twins-avatar").evaluateAll(
    (els) => els.map((e) => e.getAttribute("aria-pressed")));
  const st1 = await page.evaluate(() => {
    const w = document.getElementById("twinsWidget");
    return { input: !w.querySelector(".twins-input").disabled, hintHidden: w.querySelector(".twins-hint").hidden };
  });
  if (oneOff.join(",") === "false,true" && st1.input && st1.hintHidden) pass("390: Robin off — one-twin ask stays enabled, no hint");
  else fail(`390: one-off state wrong: ${oneOff} ${JSON.stringify(st1)}`);

  // 3. Toggle Toby off too — at-least-one invariant: ask disabled + VISIBLE hint.
  await avatars.nth(1).click();
  await page.waitForTimeout(100);
  const st2 = await page.evaluate(() => {
    const w = document.getElementById("twinsWidget");
    return { both: [].map.call(w.querySelectorAll(".twins-avatar"), (b) => b.getAttribute("aria-pressed")),
      input: w.querySelector(".twins-input").disabled, go: w.querySelector(".twins-go").disabled,
      hintVisible: !w.querySelector(".twins-hint").hidden };
  });
  if (st2.both.join(",") === "false,false" && st2.input && st2.go && st2.hintVisible)
    pass("390: both out — Ask disabled + visible hint (no silent coercion)");
  else fail(`390: both-off invariant broken: ${JSON.stringify(st2)}`);

  // 4. Toggle Robin back on — enabled again, hint hides.
  await avatars.first().click();
  await page.waitForTimeout(100);
  const st3 = await page.evaluate(() => {
    const w = document.getElementById("twinsWidget");
    return { input: !w.querySelector(".twins-input").disabled, hintHidden: w.querySelector(".twins-hint").hidden };
  });
  if (st3.input && st3.hintHidden) pass("390: re-enabled when a twin returns");
  else fail(`390: re-enable broken: ${JSON.stringify(st3)}`);

  // 5. Rendered labels byte-match the map value of record (interim "Tobi").
  const labels = await page.evaluate(() => {
    const w = document.getElementById("twinsWidget");
    return {
      names: [].map.call(w.querySelectorAll(".twins-av-name"), (e) => e.textContent),
      sys: w.querySelector(".twins-sys").textContent,
    };
  });
  if (labels.names.join("|") === "Robin|Tobi") pass("390: avatar labels render Robin|Tobi");
  else fail(`390: avatar labels wrong: ${labels.names}`);
  if (labels.sys.includes("We are the digital twins of Robin and Tobi.")) pass("390: twin line renders with the of-record spelling");
  else fail(`390: twin line wrong: ${labels.sys}`);
  if (!labels.sys.includes(EM)) pass("390: sys line carries zero em-dash");
  else fail("390: em-dash in sys line");

  // 6. No "-twin" render strings anywhere on the page.
  const bodyText = await page.evaluate(() => document.body.innerText);
  if (!bodyText.includes("Robin-twin") && !bodyText.includes("Tobi-twin")) pass("390: zero Robin-twin/Tobi-twin renders");
  else fail("390: -twin strings still render");

  // 7. sessionStorage dismiss flag remains a single boolean key.
  const skeys = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("aw")));
  if (skeys.length === 0) pass("390: no session keys set before dismissal");
  else fail(`390: unexpected session keys: ${skeys}`);
  await page.close();
}

// 8. /twins page surfaces.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL.replace(/\/$/, "") + "/twins/");
  await page.waitForTimeout(300);
  const t = await page.evaluate(() => ({
    dek: document.querySelector(".dek") ? document.querySelector(".dek").textContent : "",
    lines: [].map.call(document.querySelectorAll(".t-line strong"), (e) => e.textContent),
    body: document.body.innerText,
  }));
  if (t.dek.includes("Robin is dry and opinionated. Tobi starts fights.")) pass("/twins: dek uses map names");
  else fail(`/twins: dek wrong: ${t.dek}`);
  if (t.lines.length && t.lines.every((l) => l === "Robin:" || l === "Tobi:")) pass("/twins: card prefixes are Robin:/Tobi:");
  else fail(`/twins: card prefixes wrong: ${t.lines.slice(0, 4)}`);
  if (!t.body.includes("Robin-twin") && !t.body.includes("Tobi-twin")) pass("/twins: zero -twin render strings");
  else fail("/twins: -twin strings still render");
  await page.close();
}

await browser.close();
console.log(failures === 0 ? "P2 IDENTITY PROBE: ALL PASS" : `P2 IDENTITY PROBE: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
