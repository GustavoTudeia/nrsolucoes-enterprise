
# Playwright E2E Enterprise

Esta suíte cobre os fluxos mapeáveis da plataforma via Playwright, combinando:

- navegação pública
- signup e autenticação (email, CPF, OTP, reset, magic link)
- onboarding e billing
- estrutura organizacional
- campanhas, convites tokenizados e pesquisa pública
- inventário NR-1, formalização PGR e ergonomia (AEP/AET)
- LMS e portal do colaborador
- plataforma/admin global
- feature gates e smokes operacionais

## Pré-requisitos

### Backend
Ative o suporte de teste apenas em staging/local controlado:

```env
ENV=dev
ENABLE_E2E_TEST_SUPPORT=true
FRONTEND_URL=http://127.0.0.1:3000
```

### Frontend

```env
BACKEND_BASE_URL=http://127.0.0.1:8000/api/v1
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

## Rodando

```bash
cd frontend
npm ci
npx playwright install --with-deps
npm run test:e2e
```

## Estrutura

- `e2e/global-setup.ts` cria fixture determinística no backend
- `e2e/fixtures/auth.ts` expõe fixture compartilhada e helpers de login
- `e2e/specs/*.spec.ts` cobre os fluxos por domínio

## Segurança

`/api/v1/test-support/*` só fica exposto com `ENABLE_E2E_TEST_SUPPORT=true` ou `ENV=test`.
Nunca habilite em produção.
