# Enterprise Ops Hardening v5

Esta rodada adiciona hardening operacional e governança de runtime para produção enterprise:

## Itens cobertos

- Rate limiting em auth (login, reset, OTP, magic link e portal do colaborador)
- Refresh token rotation com persistência em banco, revogação e detecção de reuse
- E-mail assíncrono com RQ worker e fallback síncrono seguro
- Health checks reais para DB, Redis e MinIO/S3
- Redis com uso efetivo para rate limiting e cache de entitlements
- Verificação de cadeia de migrations (startup e `/ready`)
- Observabilidade com endpoint `/metrics`, Prometheus e Grafana
- Reverse proxy/TLS de produção com Caddy
- Compose de produção com worker, healthchecks e observabilidade
- CI backend reforçado com compile step

## Variáveis novas

- `REFRESH_TOKEN_EXPIRE_DAYS`
- `REFRESH_TOKEN_REUSE_DETECTION`
- `EMAIL_DELIVERY_MODE=sync|worker`
- `CACHE_DEFAULT_TTL_SECONDS`
- `AUTH_RATE_LIMIT_*`
- `METRICS_ENABLED`
- `REQUIRE_CURRENT_MIGRATION_HEAD`

## Endpoints novos/revisados

- `POST /api/v1/auth/refresh`
- `GET /api/v1/ready`
- `GET /api/v1/go-live-check`
- `GET /api/v1/metrics`

## Infra nova

- `docker-compose.prod.yml`
- `infra/caddy/Caddyfile`
- `infra/observability/prometheus.yml`
- `infra/observability/grafana/...`
- `frontend/Dockerfile`

## Observação

Em produção, mantenha:
- `AUTO_CREATE_SCHEMA=false`
- `AUTO_MIGRATE_SCHEMA=false`
- `EMAIL_DELIVERY_MODE=worker`
- TLS terminado no Caddy ou em LB equivalente
- `/metrics` exposto apenas internamente/rede privada
