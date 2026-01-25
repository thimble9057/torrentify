#!/bin/sh
set -e

ENABLE_FILMS="${ENABLE_FILMS:-false}"
ENABLE_SERIES="${ENABLE_SERIES:-false}"
ENABLE_MUSIQUES="${ENABLE_MUSIQUES:-false}"

has_partial_files() {
  DIR="$1"
  find "$DIR" -type f \( \
    -name "*.part" \
    -o -name "*.tmp" \
    -o -name "*.crdownload" \
  \) | grep -q .
}

watch_dir() {
  DIR="$1"
  LABEL="$2"

  echo "👀 Surveillance activée pour $LABEL : $DIR"

  inotifywait -m -r \
    -e create -e moved_to -e close_write \
    --format '%w%f' \
    "$DIR" 2>/dev/null | while read path
  do
    # on ignore les fichiers temporaires eux-mêmes
    case "$path" in
      *.part|*.tmp|*.crdownload)
        continue
        ;;
    esac

    PARENT="$(dirname "$path")"

    # ⛔ tant qu'il reste un .part dans le dossier → on attend
    if has_partial_files "$PARENT"; then
      echo "⏳ Téléchargement en cours ($LABEL) : $PARENT"
      continue
    fi

    case "$path" in
      *.mkv|*.mp4|*.avi|*.mov|*.flv|*.wmv|*.m4v|*.mp3|*.flac|*.aac|*.wav)
        echo "✅ Téléchargement terminé ($LABEL) : $(basename "$path")"
        node /app/scene-maker.js
        ;;
    esac
  done
}

# -------- SCAN INITIAL --------
echo "🚀 Scan initial au démarrage"
node /app/scene-maker.js
# ------------------------------

[ "$ENABLE_FILMS" = "true" ] && watch_dir "/films" "films" &
[ "$ENABLE_SERIES" = "true" ] && watch_dir "/series" "series" &
[ "$ENABLE_MUSIQUES" = "true" ] && watch_dir "/musiques" "musiques" &

if [ "$ENABLE_FILMS" != "true" ] && \
   [ "$ENABLE_SERIES" != "true" ] && \
   [ "$ENABLE_MUSIQUES" != "true" ]; then
  echo "❌ Aucun dossier surveillé"
  exit 1
fi

wait