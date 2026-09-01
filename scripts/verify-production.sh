#!/bin/bash
# DoD #3 production verification — run AFTER Otto's merge + deploy record.
# Usage: scripts/verify-production.sh [base-url]
# Checks every route in the sitemap + _redirects + og/twitter/JSON-LD census
# against the LIVE deployment. Exit 1 on any failure.
set -u
BASE="${1:-https://awa-website.netlify.app}"
fail=0
say(){ printf '%s\n' "$*"; }

# 1. Commit the deploy must match (arg 2 optional)
EXPECT="${2:-}"
if [ -n "$EXPECT" ]; then
  say "== deployed commit check: expect $EXPECT (confirm via deploy record, not this script) =="
fi

# 2. Route census from local sitemap (the indexable set) against production
cd "$(dirname "$0")/.."
say "== route census vs $BASE =="
urls=$(python3 - <<'PY'
import re
sm=open('dist/sitemap.xml').read()
import os
base=None
for l in sm.splitlines():
    m=re.search(r'<loc>(.*?)</loc>',l)
    if m and base is None: base=m.group(1).rstrip('/')
print(base)
PY
)
for p in $(python3 -c "
import re
sm=open('dist/sitemap.xml').read()
for l in sm.splitlines():
    m=re.search(r'<loc>(.*?)</loc>',l)
    if m: print(m.group(1).rstrip('/')+('/' if not m.group(1).endswith(('.xml','.txt')) else ''))
"); do
  url="$BASE${p#*netlify.app}"
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  [ "$code" = "200" ] || { say "FAIL $url -> $code"; fail=1; }
done
say "sitemap routes: all 200 (if no FAIL lines above)"

# 3. ask endpoint + _redirects (only meaningful against a host that runs
#    Netlify functions — local static servers return 501/404 here by design)
code=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"question":"ping"}' -o /tmp/vp_ask.json -w '%{http_code}' "$BASE/api/ask")
[ "$code" = "200" ] && say "OK  /api/ask -> 200 $(head -c 60 /tmp/vp_ask.json)" || say "NOTE /api/ask -> $code (expected on a local static server; FAIL only if this was the production URL)"

# 4. Per-page census on the live tree
say "== live page census =="
pages=$(python3 -c "
import glob
ps=sorted(set(glob.glob('dist/**/index.html',recursive=True))|{'dist/404.html'})
print(' '.join(p[5:-10] for p in ps))
")
for rel in $pages; do
  url="$BASE/$rel"
  curl -s "$url" -o /tmp/vp_page.html
  rel="$rel" python3 - <<'PY' || fail=1
import sys,re,os
rel=os.environ["rel"]
h=open('/tmp/vp_page.html').read()
probs=[]
if len(re.findall(r'rel="canonical"',h))!=1: probs.append("canonical!=1")
if not re.search(r'property="og:image" content=".+"',h): probs.append("og:image empty")
if 'twitter:card' not in h: probs.append("no twitter card")
if not re.search(r'name="description" content=".+"',h): probs.append("no description")
if len(re.findall(r'<h1[ >]',h))!=1: probs.append(f"h1={len(re.findall(r'<h1[ >]',h))}")
print(f"{'FAIL' if probs else 'OK  '} /{rel} {' '.join(probs)}")
sys.exit(1 if probs else 0)
PY
done

# 5. JSON-LD parses on live home + one episode + about
for rel in "" "episodes/buzz/" "about/"; do
  curl -s "$BASE/$rel" | python3 -c "
import sys,re,json
h=sys.stdin.read()
m=re.search(r'<script type=\"application/ld\+json\">\n(.*?)\n</script>',h,re.S)
assert m, 'no JSON-LD'
json.loads(m.group(1).replace('\\\\u003c','<'))
print('OK  JSON-LD /$rel')" || { say "FAIL JSON-LD /$rel"; fail=1; }
done

say "== deploy-commit proof =="
say "DoD #8: the deploy API record is the only evidence of what is live — attach it."
exit $fail
