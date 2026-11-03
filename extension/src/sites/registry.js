// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Registro degli adattatori di sito. Per un nuovo sito: aggiungere src/sites/<sito>.js, includerlo
// in manifest.json (content_scripts) e aggiungerlo qui.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  PG.sites = PG.sites || {};

  PG.sites.forHost = function forHost(host, enabledSites) {
    const all = [PG.sites.claude].filter(Boolean);
    for (const a of all) {
      if (enabledSites && !enabledSites.includes(a.id)) continue;
      if (a.hosts.some((h) => host === h || host.endsWith('.' + h))) return a;
    }
    return null;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
