#!/usr/bin/env bash
# AWA retired-palette negative census — SHARED PREDICATE OF RECORD (6 Sep 2026).
# Consumed by BOTH gates (one predicate, not two greps that drift):
#   - Yoshi's battery negative check: PLANS/AWA_REDESIGN_ACCEPTANCE_PLAN.md section 8
#   - Otto's re-armed merge gate #1 (any retired current-palette colour)
# SINGLE WRITER: Yoshi (RL Quality) — Otto validates + arms on the pinned sha;
# nobody else edits (Oksana governance pin, 6 Sep).
# Source of the gap: Oksana 6 Sep 18:22Z — the retired palette must be enumerated
# by ENCODING, not hex literal only. Baseline c2829fa carries rgba(200,255,61,...)
# and rgba(10,22,40,...) triplets (build-twins.mjs:36, build.mjs:110/120/133 ...).
# Scope: built dist TEXT surfaces (HTML/CSS/JS/SVG, inline styles, JSON-LD).
# Rasters + fonts are NOT census scope (checksum-pinned / og-card named defect);
# -I skips binaries so byte-collision cry-wolf cannot happen.
# Usage:  awa_retired_palette_census.sh [dist-dir]     (default: ./dist)
# Exit 0 = clean (grep rc 1). Exit 1 = survivor(s) — FAIL both gates.
# Exit 2 = CENSUS MALFUNCTION (could not read dist; e.g. unreadable file) —
#          hard-fails BOTH gates. An error is NEVER translated into a pass.
set -u
DIST="${1:-dist}"
[ -d "$DIST" ] || { echo "census: no dist dir: $DIST" >&2; exit 2; }

# HSL lines are hue-anchored (navy ~hsl(216deg 60% 9.8%), lime ~hsl(77deg 61% 62%));
# any hit gets a human look. Space-syntax percent rgb included (v3 rider).
PATTERNS='#0a1628[0-9a-fA-F]{0,2}
#c8ff3d[0-9a-fA-F]{0,2}
rgba?\([[:space:]]*10[[:space:]]*,[[:space:]]*22[[:space:]]*,[[:space:]]*40([[:space:]]*,[[:space:]]*[0-9.]+%?[[:space:]]*)?\)
rgba?\([[:space:]]*10[[:space:]]+22[[:space:]]+40([[:space:]]*/[[:space:]]*[0-9.]+%?[[:space:]]*)?\)
rgba?\([[:space:]]*200[[:space:]]*,[[:space:]]*255[[:space:]]*,[[:space:]]*61([[:space:]]*,[[:space:]]*[0-9.]+%?[[:space:]]*)?\)
rgba?\([[:space:]]*200[[:space:]]+255[[:space:]]+61([[:space:]]*/[[:space:]]*[0-9.]+%?[[:space:]]*)?\)
rgba?\([[:space:]]*3\.9[0-9]*%[[:space:]]*,[[:space:]]*8\.6[0-9]*%[[:space:]]*,[[:space:]]*15\.[67][0-9]*%
rgba?\([[:space:]]*3\.9[0-9]*%[[:space:]]+8\.6[0-9]*%[[:space:]]+15\.[67][0-9]*%
rgba?\([[:space:]]*78\.4[0-9]*%[[:space:]]*,[[:space:]]*100%[[:space:]]*,[[:space:]]*23\.9[0-9]*%
rgba?\([[:space:]]*78\.4[0-9]*%[[:space:]]+100%[[:space:]]+23\.9[0-9]*%
0[xX]0[aA]1628
0[xX][cC]8[fF][fF]3[dD]
hsla?\([[:space:]]*216(\.[0-9]+)?(deg)?[[:space:]]*[, ][[:space:]]*60
hsla?\([[:space:]]*77(\.[0-9]+)?(deg)?[[:space:]]*[, ][[:space:]]*61
'

# -I: skip binary files (out of scope). rc: 0 = hits, 1 = clean, >=2 = malfunction.
RC=0
HITS=$(printf '%s' "$PATTERNS" | grep -rIEin -f - "$DIST") || RC=$?
case "$RC" in
  0)
    echo "RETIRED-PALETTE SURVIVORS in $DIST:"
    printf '%s\n' "$HITS"
    exit 1
    ;;
  1)
    echo "census clean: $DIST carries zero retired-palette encodings (hex 6/8, rgb/rgba comma+space syntax, 0x literals, percent rgb, hue-anchored hsl)"
    exit 0
    ;;
  *)
    echo "CENSUS MALFUNCTION (grep rc=$RC) on $DIST — cannot prove absence; gate FAILS (both gates)" >&2
    exit 2
    ;;
esac
