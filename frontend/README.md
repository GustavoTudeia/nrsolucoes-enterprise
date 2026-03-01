# NRSoluções — Frontend Enterprise (Next.js)

Este repositório contém o frontend **completo** (website público + Console/Admin + Portal do Colaborador) pronto para chamar o backend existente via **BFF (proxy server-side)** do Next.js, com **cookies HttpOnly** para tokens.

## Stack
- Next.js (App Router) + TypeScript
- TailwindCSS + shadcn/ui (componentes base)
- react-hook-form + zod (forms)
- Sonner (toasts)
- BFF: `/api/bff/{scope}/...` (proxy para o backend)

## Pré-requisitos
- Node.js 18+ (recomendado 20+)
- Backend rodando e acessível (ex.: `http://localhost:8000/api/v1`)

## Configuração
1) Instale dependências:
```bash
npm install
```

2) Configure variáveis:
```bash
cp .env.example .env.local
```

Edite `.env.local`:
- `BACKEND_BASE_URL=http://localhost:8000/api/v1`
- `COOKIE_SECURE=false` (true apenas se estiver servindo em HTTPS)

3) Rode o projeto:
```bash
npm run dev
```

Acesse:
- Website público: `http://localhost:3000/`
- Login do Console: `http://localhost:3000/login`
- Console (após login): `http://localhost:3000/dashboard`
- Portal colaborador (OTP): `http://localhost:3000/employee/{tenantSlug}`

## Como o frontend chama o backend
O browser **não chama** o backend diretamente. Em vez disso:
- o frontend chama o **BFF** do Next em: `/api/bff/{scope}/...`
- o BFF injeta `Authorization: Bearer <token>` com base em cookies HttpOnly:
  - `console_token` para o Console (admin)
  - `employee_token` para o Portal do colaborador

Escopos:
- `public`: rotas públicas do backend
- `console`: rotas autenticadas do Console
- `employee`: rotas autenticadas do Portal do colaborador

## Autenticação
### Console (Admin)
- Página: `/login`
- A rota `POST /api/auth/console/login` chama o backend `/auth/login` e salva `console_token` em cookie HttpOnly.

### Portal do colaborador
- OTP:
  - `/employee/{tenantSlug}` resolve `tenant_id` e chama:
    - `POST /api/auth/employee/otp/start`
    - `POST /api/auth/employee/otp/verify` (salva `employee_token`)
- Magic link:
  - Console gera `magic_link_api_url` no invite do colaborador.
  - No UI, mostramos também um link amigável:
    - `/employee/magic/{token}`
  - A página consome o token via `GET /api/auth/employee/magic/{token}` e salva `employee_token`.

## Módulos implementados (Console)
- Dashboard
- Organização:
  - CNPJs
  - Setores/Unidades (org_unit)
- Colaboradores:
  - cadastro e geração de link
- Questionários:
  - criar template
  - criar versão (JSON)
  - publicar versão
- Campanhas:
  - criar, abrir, encerrar (workspace local para IDs)
- Resultados:
  - agregado geral
  - agregado por org_unit (com bloqueio por limiar mínimo LGPD)
- Classificação de risco:
  - gera RiskAssessment e salva no workspace local
- Plano de ação:
  - criar plano (por RiskAssessment)
  - adicionar itens (educacional/organizacional/administrativo)
  - evidências
- LMS:
  - conteúdos
  - atribuições (workspace local para IDs)
- Billing:
  - assinatura atual
  - checkout por plano + afiliado
- Platform Admin:
  - afiliados (list/create)
  - ledger (list)
  - payouts (create/mark-paid)

## Nota importante (endpoints de listagem)
O backend atual **não expõe listagens** para alguns recursos (ex.: templates/versões de questionário, campanhas, action plans, assignments no console).
Para permitir operação imediata, o frontend mantém um **workspace local (localStorage)** com IDs recém-criados.

Se você quiser, posso:
- adicionar listagens e filtros no backend (enterprise-grade)
- remover dependência do localStorage no console
- adicionar exportações PDF/CSV e dashboards BI.

## Estrutura de rotas
- Website público: `src/app/(public)/...`
- Console/Admin: `src/app/(console)/...`
- Portal colaborador: `src/app/(employee)/employee/...`
- BFF/Proxy: `src/app/api/bff/[scope]/[...path]/route.ts`

## Observabilidade e enterprise hardening (sugestões)
- SSO (SAML/OIDC), RBAC avançado e auditoria central
- Storage assinado (S3/GCS) para evidências com hashing/immutability
- Feature flags por tenant
- Rate limiting e proteção contra abuso em endpoints públicos
- Logs estruturados + tracing (OpenTelemetry)
