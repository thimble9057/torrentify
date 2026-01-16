# 🧲 Torrentify

**Torrentify** est un conteneur Docker qui génère automatiquement des fichiers  
**.torrent**, **.nfo** et des métadonnées **TMDb** à partir de **films et de séries**.

Il surveille un ou plusieurs dossiers de vidéos, analyse les noms de fichiers,
récupère les informations depuis **TMDb** et prépare des fichiers propres et prêts
à l’usage pour les **trackers privés** depuis une machine **Unraid**, **NAS** et **seedbox**.

---

## ✨ Fonctionnalités

- 🎬 Génération automatique de fichiers `.torrent`
- 🧲 Trackers configurables via variables d’environnement
- 🛠️ Mise à jour des **Trackers** via `mkbrr`
- 📝 Création de fichiers `.nfo` propres (sans chemins absolus)
- 📄 Fichier `.txt` avec ID TMDb ou message explicite si non trouvé
- 👀 Surveillance en temps réel des dossiers **films et/ou séries**
- 🔄 Scan initial automatique au démarrage du conteneur
- 🔍 Scan récursif des sous-dossiers
- 🧠 Analyse intelligente des noms de fichiers (GuessIt)
- 🎞️ Recherche TMDb avec cache local
- ⚙️ Activation indépendante des **films** et des **séries**
- 📁 Sortie structurée par type (films / séries)
- 🐳 Image Docker légère basée sur Alpine
- 🧱 Compatible multi-architecture (`amd64` / `arm64`)

---

## ⚙️ Variables d’environnement

| Variable | Description |
|--------|------------|
| `TMDB_API_KEY` | Clé API TMDb |
| `TRACKERS` | URLs des trackers (séparées par des virgules) |
| `ENABLE_FILMS` | Active le traitement et la surveillance des films (`true` / `false`) |
| `ENABLE_SERIES` | Active le traitement et la surveillance des séries (`true` / `false`) |
| `PARALLEL_JOBS` | Nombre de fichiers traités en parallèle (défaut : `1`) |

> ⚠️ **Au moins un des deux** (`ENABLE_FILMS` ou `ENABLE_SERIES`) doit être activé.

---

## 📁 Volumes

### 📥 Entrée (vidéos)
| Chemin conteneur | Description |
|-----------------|------------|
| `/films` | Dossier des films (optionnel) |
| `/series` | Dossier des séries (optionnel) |

### 📤 Sortie
| Chemin conteneur | Description |
|-----------------|------------|
| `/data` | Torrents, NFO, Fichiers TXT générés et Cache local TMDb |

---

## 📂 Structure générée

```text
data/
├── films/
│   └── Nom.Film/
│       ├── Nom.Film.torrent
│       ├── Nom.Film.nfo
│       └── Nom.Film.txt
├── series/
│   └── Nom.Serie/
│       ├── Nom.Serie.torrent
│       ├── Nom.Serie.nfo
│       └── Nom.Serie.txt
├── cache_tmdb
│   └── X.json
└── trackers.fingerprint.sha256 <-- fingerprint variable `TRACKERS`
```
## 🚀 Exemple docker-compose

```yaml
services:
  torrentify:
    image: thimble9057/torrentify:latest
    container_name: torrentify
    restart: unless-stopped
    
    user: "1000:1000"

    environment:
      # Activation des médias
      ENABLE_FILMS: "true"
      ENABLE_SERIES: "false"

      # TMDb
      TMDB_API_KEY: votre_cle_tmdb

      # Trackers (séparés par virgules)
      TRACKERS: https://tracker1/announce,https://tracker2/announce

      # Optionnel
      PARALLEL_JOBS: 1

    volumes:
      # Entrées
      - /source/films:/data/films
      - /source/series:/data/series

      # Sorties
      - /destination/torrent:/data
```
## 📝 Notes

Les séries sont traitées exactement comme les films
(pas de gestion saison/épisode spécifique).

Un fichier/dossier vidéo = un torrent.

Les fichiers déjà traités ne sont jamais régénérés.