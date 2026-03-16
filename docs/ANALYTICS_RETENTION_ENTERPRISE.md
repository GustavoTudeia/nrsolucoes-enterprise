# Enterprise Analytics & Retention Layer

Esta rodada adiciona uma camada anti-churn e de product analytics orientada a SaaS B2B multi-tenant.

## Objetivos
- medir ativação e retenção por tenant
- identificar risco de churn antes da renovação
- instrumentar o produto sem vazar PII para terceiros
- suportar GA4 (aquisição) e PostHog (produto/retention)

## Stack recomendada
- **GA4**: site público e aquisição
- **PostHog**: produto, group analytics por tenant, feature flags, surveys, workflows e replay
- **Backend**: fonte canônica dos eventos críticos

## Variáveis de ambiente
### Backend
- `ANALYTICS_ENABLED=true`
- `POSTHOG_ENABLED=true`
- `POSTHOG_HOST=https://app.posthog.com`
- `POSTHOG_PROJECT_API_KEY=...`
- `GA4_ENABLED=true`
- `GA4_MEASUREMENT_ID=G-XXXX`
- `GA4_API_SECRET=...`
- `ANALYTICS_RETENTION_EMAILS_ENABLED=true`
- `ANALYTICS_HEALTH_LOOKBACK_DAYS=30`

### Frontend
- `NEXT_PUBLIC_GA4_ID=G-XXXX`
- `NEXT_PUBLIC_POSTHOG_KEY=phc_...`
- `NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com`

## Eventos canônicos
São persistidos no backend e podem ser encaminhados a PostHog/GA4:
- aquisição: `public_signup_completed`, `billing_checkout_completed`
- onboarding: `cnpj_created`, `employee_created`
- ativação: `campaign_created`, `questionnaire_submitted`, `inventory_item_created`
- valor: `action_plan_created`, `evidence_uploaded`, `report_exported`, `pgr_formalized`
- adoção: `training_completed`, `esocial_export_generated`
- receita: `payment_succeeded`, `payment_failed`, `subscription_canceled`

## Health score do tenant
A plataforma calcula score 0-100 com cinco blocos:
- onboarding
- ativação
- profundidade
- rotina
- financeiro

Bandas:
- `healthy`
- `attention`
- `risk`
- `critical`

## Nudges e workflows
O backend gera `TenantNudge` com base em:
- onboarding travado
- conta sem ativação
- uso concentrado em um único papel
- falta de evidência/ação
- risco financeiro

O admin da plataforma pode disparar workflows em lote em:
- `/platform/analytics`

## Privacidade / LGPD
- não enviar e-mail, CPF, CNPJ, nome ou conteúdo sensível para GA4/PostHog
- usar `tenant_id` e `user_id` internos
- público depende de consentimento explícito de analytics
- console/employee continuam registrando eventos canônicos internos mesmo sem consentimento para terceiros

## Limitações
- surveys, feature flags remotas e workflows avançados do PostHog dependem de configuração no projeto PostHog
- forwarding GA4 server-side depende de `GA4_API_SECRET`
- e-mails operacionais dependem da infraestrutura SMTP/API já configurada na plataforma
