# SPDX-License-Identifier: AGPL-3.0-or-later
#
# OpenBao - configurazione di produzione per una singola VM (NON "dev mode").
# Storage integrato (raft, nodo singolo) nel volume openbao-data (/openbao/file).
#
# Il listener è in chiaro perché OpenBao è raggiungibile solo dalla rete interna
# Docker "data" (api, openbao-init, backup). Se si espone OpenBao fuori da quella
# rete, abilitare il TLS (tls_cert_file / tls_key_file) e togliere tls_disable.
#
# Sblocco (unseal): di default con chiavi Shamir, da inserire dopo ogni riavvio con
# scripts/openbao-unseal.sh. Per lo sblocco automatico vedi seal-static.hcl.example.

ui = false

# mlock: OpenBao ha rimosso il supporto a mlock (CHANGELOG 2.0, GH-363) e l'opzione
# "disable_mlock" è obsoleta: non serve né disable_mlock né la capability IPC_LOCK.

storage "raft" {
  path    = "/openbao/file"
  node_id = "openbao-1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

api_addr     = "http://openbao:8200"
cluster_addr = "http://openbao:8201"

# niente telemetria verso l'esterno; log in formato JSON su stdout
log_format = "json"
