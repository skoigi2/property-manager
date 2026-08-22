#!/usr/bin/env bash
# Post-process a recorded tutorial:
#   .webm → .mp4 (h264/yuv420p) with a 2s title card prepended and a 2s
#   "Next: …" end card appended, plus a poster JPG from the 3s mark.
# Subtitles are NOT burned in (they ship as a WebVTT track); pass --burn to
# additionally render <key>.captioned.mp4 for sharing outside the app.
#
# Usage: postprocess.sh <key> <title> <next_line> [--burn]
set -euo pipefail

KEY="$1"
TITLE="$2"
NEXT_LINE="$3"
BURN="${4:-}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
SRC="$DIR/output/$KEY/$KEY.webm"
OUT_DIR="$ROOT/public/tutorials"
MP4="$OUT_DIR/$KEY.mp4"
POSTER="$OUT_DIR/$KEY.jpg"
VTT="$OUT_DIR/$KEY.vtt"

mkdir -p "$OUT_DIR"
[ -f "$SRC" ] || { echo "No recording at $SRC" >&2; exit 1; }

# Font: prefer Inter if installed, else the system sans (Arial on Windows).
FONT=""
for CANDIDATE in \
  "C:/Windows/Fonts/Inter-Regular.ttf" \
  "C:/Windows/Fonts/Inter.ttf" \
  "/usr/share/fonts/truetype/inter/Inter-Regular.ttf" \
  "C:/Windows/Fonts/arial.ttf" \
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; do
  [ -f "$CANDIDATE" ] && { FONT="$CANDIDATE"; break; }
done
[ -n "$FONT" ] || { echo "No usable font found for drawtext" >&2; exit 1; }
# ffmpeg drawtext needs the drive colon escaped on Windows paths.
FONT_ESC="${FONT/C:/C\\:}"

# drawtext text needs ' and : escaped.
esc() { printf '%s' "$1" | sed "s/\\\\/\\\\\\\\/g; s/'/\\\\\\\\\\\\'/g; s/:/\\\\:/g"; }
TITLE_ESC="$(esc "$TITLE")"
NEXT_ESC="$(esc "$NEXT_LINE")"

TMP="$DIR/output/$KEY/tmp"
mkdir -p "$TMP"

# 1. Main body: webm → h264 mp4.
ffmpeg -y -loglevel error -i "$SRC" \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 22 -r 25 -an \
  "$TMP/body.mp4"

# 2. Title card (2s, navy background, gold-on-white text).
ffmpeg -y -loglevel error -f lavfi -i "color=c=0x132635:s=1280x800:d=2:r=25" \
  -vf "drawtext=fontfile='$FONT_ESC':text='$TITLE_ESC':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=fontfile='$FONT_ESC':text='Groundwork PM tutorial':fontcolor=0xC69C4A:fontsize=26:x=(w-text_w)/2:y=(h-text_h)/2+50" \
  -c:v libx264 -pix_fmt yuv420p -an "$TMP/title.mp4"

# 3. End card (2s, "Next: …").
ffmpeg -y -loglevel error -f lavfi -i "color=c=0x132635:s=1280x800:d=2:r=25" \
  -vf "drawtext=fontfile='$FONT_ESC':text='$NEXT_ESC':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=(h-text_h)/2" \
  -c:v libx264 -pix_fmt yuv420p -an "$TMP/end.mp4"

# 4. Concatenate.
printf "file 'title.mp4'\nfile 'body.mp4'\nfile 'end.mp4'\n" > "$TMP/concat.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$TMP/concat.txt" -c copy "$MP4"

# 5. Poster from the 3s mark (1s into the body).
ffmpeg -y -loglevel error -ss 3 -i "$MP4" -frames:v 1 -q:v 3 "$POSTER"

# 6. Optional burned-caption variant for sharing outside the app.
if [ "$BURN" = "--burn" ]; then
  if [ -f "$VTT" ]; then
    VTT_ESC="${VTT/C:/C\\:}"
    ffmpeg -y -loglevel error -i "$MP4" \
      -vf "subtitles='$VTT_ESC':force_style='FontSize=18,PrimaryColour=&Hffffff,BackColour=&H80000000,BorderStyle=4'" \
      -c:v libx264 -pix_fmt yuv420p -crf 22 -an "$OUT_DIR/$KEY.captioned.mp4"
    echo "burned: $OUT_DIR/$KEY.captioned.mp4"
  else
    echo "⚠ --burn requested but $VTT not found; skipping captioned render" >&2
  fi
fi

rm -rf "$TMP"
echo "mp4: $MP4"
echo "poster: $POSTER"
