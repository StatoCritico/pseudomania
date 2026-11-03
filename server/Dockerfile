# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Pseudomania (Enterprise edition) - immagine dell'API (Python 3.12, utente non root).
#
#   docker build -t pseudogate-api:0.1.0 server/
#
# Richiede PostgreSQL (DB applicativo + key store separato), OpenBao (chiave HMAC), OIDC.
# L'edizione personale non usa il server. Vedi deploy/.env.example.

ARG PYTHON_IMAGE=python:3.12.16-slim-trixie

# --- dipendenze in un virtualenv separato -----------------------------------
FROM ${PYTHON_IMAGE} AS build
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt /tmp/requirements.txt
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --upgrade pip \
 && /opt/venv/bin/pip install -r /tmp/requirements.txt

# --- immagine finale -------------------------------------------------------------
FROM ${PYTHON_IMAGE}
LABEL org.opencontainers.image.title="Pseudomania API (Enterprise edition)" \
      org.opencontainers.image.url="https://pseudomania.statocritico.it" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.description="Pseudonimizzazione reversibile per claude.ai"

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8787 \
    WORKERS=2

RUN useradd --system --uid 10001 --user-group --home-dir /app --shell /usr/sbin/nologin pseudogate \
 && mkdir -p /var/lib/pseudogate/registro /var/lib/pseudogate/esportazioni \
 && chown 10001:10001 /var/lib/pseudogate/registro /var/lib/pseudogate/esportazioni \
 && chmod 700 /var/lib/pseudogate/esportazioni

COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY --chown=root:root pseudogate/ /app/pseudogate/
COPY --chown=root:root config/ /app/config/
COPY --chown=root:root migrations/ /app/migrations/

USER 10001:10001
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,sys,urllib.request; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8787\")}/v1/health', timeout=4).status==200 else 1)"

CMD ["python", "-m", "pseudogate", "serve"]
