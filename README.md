# ai-agent-infra-demo

Bozza iniziale — infrastruttura per agenti AI, con servizi descritti da manifest standard e pagamento nativo HTTP (x402, fase successiva).

**Owner idea:** Fede · **Build assist:** agente di Arma (Opus 4.7), continuato in locale
**Creato:** 2026-04-19

## Obiettivo
Un registry minimale di "agent services" dove ogni servizio espone:
- `capabilities` — cosa sa fare (con `input_schema`/`output_schema` JSON-Schema inline)
- `pricing` — costo per chiamata (micropagamento stablecoin, disattivato in v0)
- reputation operazionale (uptime, call_count, rating) per ranking

## Componenti
1. **manifest-spec/** — JSON Schema del manifest del servizio
2. **registry/** — registry centralizzato su `:4000` (Node + Express, storage su file JSON in `data/`)
3. **service-demo/weather/** — meteo su `:4100` · capability `get_weather`
4. **service-demo/currency/** — conversione valute su `:4101` · capability `convert_currency`
5. **service-demo/summarize/** — riassunto testo su `:4102` · capability `summarize_text`
6. **client-demo/index.js** — flow single-task (discovery → invoke → report → rate)
7. **client-demo/multi.js** — flow multi-task (3 capability diverse in sequenza)
8. **scripts/demo-all.js** — orchestrator: avvia registry + 3 service + client in un solo terminale

## Come eseguire

Serve Node ≥ 18 (per `fetch` nativo).

```bash
npm install

# opzione A — demo completa in un solo comando (consigliata per video/dimostrazione)
npm run demo:all
# poi apri http://localhost:4000 per la dashboard
# premi Ctrl+C per spegnere tutto

# opzione B — manuale, un terminale per componente
npm run registry
npm run weather      # (+ currency, + summarize in altri terminali)
npm run demo:multi   # oppure "npm run demo" per il flow single-task
```

## Dashboard
Il registry serve una dashboard web su `http://localhost:4000/` che si auto-aggiorna ogni 2s mostrando: service registrati, reputation composita, uptime 24h, latenza media, call count, ratings, e le `capabilities` con i rispettivi `input_schema` / `output_schema` espandibili.

I dati vivono in `data/` (`registry.json`, `ratings.json`, `clients.json`) — cancellala per reset totale.

## Endpoint del registry

| Metodo | Path                        | Auth                     | Scopo                             |
|--------|-----------------------------|--------------------------|-----------------------------------|
| POST   | `/clients`                  | —                        | Emette `client_id` + `client_secret` |
| POST   | `/register`                 | `owner_secret` in body   | Registra un service               |
| GET    | `/discover`                 | —                        | Lista con filtri `?capability=&sort=reputation` |
| GET    | `/services/:id`             | —                        | Dettaglio                         |
| PATCH  | `/services/:id`             | header `X-Owner-Secret`  | Aggiorna manifest                 |
| DELETE | `/services/:id`             | header `X-Owner-Secret`  | Deregistra                        |
| POST   | `/services/:id/rate`        | credenziali client       | Rating 1–5                        |
| POST   | `/services/:id/report`      | credenziali client       | Report `{ok, latency_ms}`         |

## Reputation
Score composito: `0.5 * uptime_score + 0.3 * rating_norm + 0.2 * min(log(call_count+1)/log(1000), 1)`

- `uptime_score`: health-check su `GET {endpoint}/manifest` ogni 60s, finestra mobile 24h
- `rating_norm`: media rating / 5
- `call_count`: dai `/report` dei client

## Stato
- [x] Cartella creata
- [x] Manifest spec v0
- [x] Registry (Node/Express) con reputation composita + health-check + warmup
- [x] 3 service demo con capability diverse
- [x] Client single-task e multi-task
- [x] Orchestrator `demo:all` per lanciare tutto in un comando
- [ ] Client con x402 (pagamento stablecoin su Base)
- [ ] Pubblicazione del manifest come `/.well-known/agent.json`
