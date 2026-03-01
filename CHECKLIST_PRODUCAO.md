# Checklist de Produção (Enterprise Brasil)

Este checklist cobre **segurança, conformidade e operação** para colocar a plataforma em produção.
Ele é um guia técnico/operacional (não substitui consultoria jurídica/contábil).

## 1) Segurança & Identidade

- [ ] **ENV** em produção: `ENV=prod` (ou `staging`).
- [ ] **JWT_SECRET_KEY** forte (mínimo 32+ bytes, aleatório). Em `ENV!=dev` o backend falha se estiver `CHANGE_ME`.
- [ ] Desabilitar toggles DEV:
  - [ ] `DEV_RETURN_OTP=false`
  - [ ] `DEV_RETURN_PASSWORD_RESET_TOKEN=false`
- [ ] Termos/privacidade versionados e URLs públicas:
  - [ ] `LEGAL_TERMS_VERSION`, `LEGAL_PRIVACY_VERSION`
  - [ ] `LEGAL_TERMS_URL`, `LEGAL_PRIVACY_URL`
- [ ] (Opcional enterprise) preparar SSO/IdP: OIDC/SAML (planejar na etapa de infra).

## 2) LGPD (dados e minimização)

- [ ] Revisar `min_anon_threshold` (TenantSettings) conforme política interna.
- [ ] Validar que fluxos de diagnóstico não coletam PII (respostas são anônimas).
- [ ] Política de retenção: definir período de histórico e exportações.

## 3) Observabilidade & Auditoria

- [ ] Ativar coleta de logs estruturados (JSON) e correlação por request_id.
- [ ] Monitorar trilha de auditoria (tela **Auditoria**) e revisar eventos críticos.
- [ ] Export/relatórios: usar **Relatórios (Dossiê)** e guardar evidências em repositório controlado.

## 4) Storage (LMS) e evidências

- [ ] Em produção, usar S3/GCS/Azure Blob (S3 compatível):
  - [ ] `S3_ENDPOINT_URL` (ou endpoint cloud)
  - [ ] `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
  - [ ] `S3_BUCKET`
  - [ ] `S3_PUBLIC_ENDPOINT_URL` (se necessário para browser)
- [ ] Definir CORS do bucket para domínios do frontend.

## 5) Banco de dados

- [ ] Postgres gerenciado (ou cluster) com backups e PITR.
- [ ] Migrations via Alembic em pipeline.
- [ ] Segredos via Vault/Secret Manager.

## 6) Frontend

- [ ] Configurar `BACKEND_BASE_URL` (frontend) para a URL pública da API.
- [ ] `COOKIE_SECURE=true` em HTTPS.
- [ ] Reverse proxy (Nginx/Ingress) com TLS e headers de segurança.

## 7) Performance & Escalabilidade

- [ ] Planejar cache (Redis), filas (RQ/Celery) e workers.
- [ ] Rate limiting e proteção DDoS/WAF.
- [ ] Testes de carga por tenant/CNPJ/unidade.

---

**Nota**: A etapa 7 (infra/escala) você pediu para discutirmos depois — este checklist já deixa os pontos de decisão explícitos.
