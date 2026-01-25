# ======================
# Stage 1 : build mkbrr
# ======================
FROM golang:1.25-alpine AS mkbrr-builder

RUN apk add --no-cache git

WORKDIR /build

RUN git clone https://github.com/autobrr/mkbrr.git \
    && cd mkbrr \
    && go build -o mkbrr

# ======================
# Stage 2 : image finale
# ======================
FROM node:20-alpine

# ----------------------
# Dépendances système
# ----------------------
RUN apk add --no-cache \
    python3 \
    py3-pip \
    mediainfo \
    bash \
    git \
    build-base \
    inotify-tools \
    curl \
    jq

# ----------------------
# Copier mkbrr compilé
# ----------------------
COPY --from=mkbrr-builder /build/mkbrr/mkbrr /usr/local/bin/mkbrr
RUN chmod +x /usr/local/bin/mkbrr

# ----------------------
# Python : venv (PEP 668)
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
RUN chmod +x *.js *.sh \
 && chown -R node:node /app /opt/venv

# ----------------------
# Utilisateur non-root
# ----------------------
RUN chown -R node:node /app /opt/venv
USER node

# ----------------------
# Volumes
# ----------------------
VOLUME ["/data"]

# ----------------------
# Lancement
# ----------------------
CMD ["sh", "/app/watch.sh"]
