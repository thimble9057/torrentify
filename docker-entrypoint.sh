#!/bin/sh
set -e

PUID=${PUID:-99}
PGID=${PGID:-100}

echo "🔐 Démarrage avec UID=$PUID GID=$PGID"

# ======================
# Gestion du groupe
# ======================
GROUP_NAME=$(getent group "$PGID" | cut -d: -f1)

if [ -z "$GROUP_NAME" ]; then
  GROUP_NAME=app
  echo "➕ Création du groupe $GROUP_NAME (GID=$PGID)"
  addgroup -g "$PGID" "$GROUP_NAME"
else
  echo "ℹ️ Groupe existant : $GROUP_NAME (GID=$PGID)"
fi

# ======================
# Gestion de l'utilisateur
# ======================
USER_NAME=$(getent passwd "$PUID" | cut -d: -f1)

if [ -z "$USER_NAME" ]; then
  USER_NAME=app
  echo "➕ Création de l'utilisateur $USER_NAME (UID=$PUID)"
  adduser -D -H -u "$PUID" -G "$GROUP_NAME" "$USER_NAME"
else
  echo "ℹ️ Utilisateur existant : $USER_NAME (UID=$PUID)"
fi

# ======================
# Permissions
# ======================
echo "🔐 Application des permissions sur /data et /app"
chown -R "$USER_NAME":"$GROUP_NAME" /data /app || true

# ======================
# Lancement
# ======================
echo "▶️ Exécution en tant que $USER_NAME"
exec su-exec "$USER_NAME" "$@"
