# 🧲 Torrentify

**Torrentify** est un conteneur Docker qui génère automatiquement des fichiers  
**.torrent**, **.nfo** et des métadonnées **TMDb** à partir de **films et de séries**.

Il surveille un ou plusieurs dossiers de vidéos, analyse les noms de fichiers, récupère les informations depuis TMDb et prépare des fichiers propres et prêts à l’usage pour les **trackers privés** et les serveurs **Unraid / NAS**.

---

## ✨ Fonctionnalités

- 🎬 Génération automatique de fichiers `.torrent`
- 📝 Création de fichiers `.nfo` propres (sans chemin complet)
- 📄 Fichier `.txt` avec ID TMDb ou message explicite si non trouvé
- 👀 Surveillance en temps réel des dossiers **films et/ou séries**
- 🔄 Scan initial automatique au démarrage du conteneur
- 🔍 Scan récursif des sous-dossiers
- 🧠 Analyse intelligente des noms de fichiers (GuessIt)
- 🎞️ Recherche TMDb avec cache local
- 🧲 Trackers configurables via variables d’environnement
- ⚙️ Activation indépendante des **films** et des **séries**
- 📁 Sortie séparée pour les films et les séries
- 🔐 Compatible Unraid (`PUID` / `PGID`)
- 🐳 Image Docker légère basée sur Alpine
- 🧱 Compatible multi-architecture (`amd64` / `arm64`)

---

## ⚙️ Variables d’environnement

| Variable | Description |
|--------|------------|
| `TMDB_API_KEY` | Clé API TMDb |
| `TRACKERS` | URL des trackers séparées par des virgules |
| `ENABLE_FILMS` | Active le traitement et la surveillance des films (`true` / `false`) |
| `ENABLE_SERIES` | Active le traitement et la surveillance des séries (`true` / `false`) |
| `PARALLEL_JOBS` | Nombre de fichiers traités en parallèle (défaut : 1) |
| `PUID` | UID utilisateur (Unraid) |
| `PGID` | GID utilisateur (Unraid) |

> ⚠️ Au moins un des deux (`ENABLE_FILMS` ou `ENABLE_SERIES`) doit être activé.

---

## 📁 Volumes

### Entrée
| Chemin | Description |
|------|------------|
| `/data/films` | Dossier des films (optionnel) |
| `/data/series` | Dossier des séries (optionnel) |

### Sortie
| Chemin | Description |
|------|------------|
| `/data/torrent` | Fichiers générés (films et séries séparés) |
| `/data/cache_tmdb` | Cache local TMDb |

---

## 📂 Structure générée

```text
/data/torrent/
├── films/
│   └── Nom.Film/
│       ├── Nom.Film.torrent
│       ├── Nom.Film.nfo
│       └── Nom.Film.txt
└── series/
    └── Nom.Serie/
        ├── Nom.Serie.torrent
        ├── Nom.Serie.nfo
        └── Nom.Serie.txt
```
## 🚀 Exemple docker-compose

```yaml
version: "3.8"

services:
  torrentify:
    image: thimble9057/torrentify:latest
    container_name: torrentify
    restart: unless-stopped

    environment:
      PUID: 1000
      PGID: 1000
      TMDB_API_KEY: votre_cle_tmdb
      TRACKERS: https://tracker1/announce,https://tracker2/announce
      ENABLE_FILMS: "true"
      ENABLE_SERIES: "false"
      PARALLEL_JOBS: 1

    volumes:
      - /mnt/user/data/films:/data/films
      - /mnt/user/data/series:/data/series
      - /mnt/user/data/torrent:/data/torrent
      - /mnt/user/data/cache_tmdb:/data/cache_tmdb
```
## 📝 Notes

Les séries sont traitées exactement comme les films
(pas de gestion saison/épisode spécifique).

Un fichier/dossier vidéo = un torrent.

Les fichiers déjà traités ne sont jamais régénérés.

Compatible Unraid, NAS, VPS, Raspberry Pi.
