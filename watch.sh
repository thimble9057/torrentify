#!/bin/sh
set -e

ENABLE_FILMS="${ENABLE_FILMS:-false}"
ENABLE_SERIES="${ENABLE_SERIES:-false}"

watch_dir() {
  DIR="$1"
  LABEL="$2"

  echo "👀 Surveillance activée pour $LABEL : $DIR"

  inotifywait -m -r \
    -e create -e moved_to -e close_write \
    --format '%f' \
    "$DIR" 2>/dev/null | while read file
  do
    case "$file" in
      *.mkv|*.mp4|*.avi|*.mov|*.flv|*.wmv|*.m4v)
        echo "🎬 Nouveau fichier détecté ($LABEL) : $file"
        node /app/scene-maker.js
        ;;
    esac
  done
}

# -------- SCAN INITIAL --------
echo "🚀 Scan initial au démarrage"
node /app/scene-maker.js
# ------------------------------

if [ "$ENABLE_FILMS" = "true" ]; then
  watch_dir "/films" "films" &
fi

if [ "$ENABLE_SERIES" = "true" ]; then
  watch_dir "/series" "series" &
fi

if [ "$ENABLE_FILMS" != "true" ] && [ "$ENABLE_SERIES" != "true" ]; then
  echo "❌ Aucun dossier surveillé (ENABLE_FILMS / ENABLE_SERIES)"
  exit 1
fi

wait
