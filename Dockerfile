FROM node:20-alpine

# ----------------------
# Dépendances système
# ----------------------
RUN apk add --no-cache \
    python3 \
    py3-pip \
    mediainfo \
    mktorrent \
    bash \
    git \
    build-base \
    inotify-tools \
    curl \
    jq

# ----------------------
# Python : venv pour PEP 668
# ----------------------
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir guessit

ENV PATH="/opt/venv/bin:$PATH"

# ----------------------
# Node.js dependencies
# ----------------------
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# ----------------------
# Scripts
# ----------------------
COPY . .
RUN chmod +x *.js *.sh

# ----------------------
# Volumes
# ----------------------
VOLUME ["/data/films", "/data/torrent", "/data/cache_tmdb"]

# ----------------------
# Lancement
# ----------------------
CMD ["sh", "/app/watch.sh"]
