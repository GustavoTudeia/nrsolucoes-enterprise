# Enterprise Closure v3 — Go-live real (cirúrgico)

Esta rodada foi focada em fechar lacunas de **go-live real** sem abrir refatorações amplas.

## Objetivos desta rodada

1. Formalização do inventário/PGR com snapshot, hash e responsável.
2. Camada básica de ergonomia (AEP/AET) compatível com NR-17.
3. Hardening operacional leve e sem efeito colateral relevante.
4. Readiness/go-live checks para operação enterprise.
5. Ajustes de narrativa pública e documentos institucionais base.

## O que entrou no backend

### 1) Governança formal do PGR
- Nova tabela/modelo `pgr_document_approval`
- Endpoints:
  - `GET /api/v1/pgr/approvals`
  - `POST /api/v1/pgr/approvals`
- Geração de snapshot do inventário aprovado por escopo (CNPJ/unidade)
- Hash SHA-256 do snapshot
- Supersedência automática de aprovações ativas anteriores no mesmo escopo
- Evento de auditoria para a formalização

### 2) Ergonomia / NR-17 (AEP/AET básico)
- Nova tabela/modelo `ergonomic_assessment`
- Endpoints:
  - `GET /api/v1/pgr/ergonomics`
  - `POST /api/v1/pgr/ergonomics`
  - `PUT /api/v1/pgr/ergonomics/{id}`
  - `POST /api/v1/pgr/ergonomics/{id}/approve`
- Gate por feature `NR17`

### 3) Hardening operacional
- `SecurityHeadersMiddleware` na API
- Novos endpoints de operação:
  - `GET /api/v1/ready`
  - `GET /api/v1/go-live-check` (admin da plataforma)

### 4) Readiness e dossiê
- `/reports/readiness` agora considera:
  - inventário aprovado
  - formalização do PGR
  - AEP/AET aprovado quando aplicável
- Dossiê PGR passa a incluir:
  - inventário
  - formalizações
  - ergonomia

### 5) Migrations
- Nova migration Alembic: `20260314_go_live_v3.py`

## O que entrou no frontend

### 1) Inventário NR-1
- Seção de **formalização do inventário/PGR** na página de inventário
- Lista de versões formais com hash e vigência

### 2) Nova página AEP/AET
- Rota: `/ergonomia`
- Criar, listar e aprovar avaliações AEP/AET
- Gate por `NR17`

### 3) Gate de navegação
- Menu lateral com item `AEP / AET`
- Route-level gate em `(console)/layout.tsx`

### 4) Comunicação pública
- Ajuste de claims de prova social para evitar promessas absolutas não comprovadas
- Termos e Política de Privacidade substituídos por **templates base mais sérios**, sem rotulagem de placeholder

## Validação executada

- `python -m compileall backend/app` ✅
- `pytest -q` backend → **17 testes passando** ✅

## Limites desta rodada

Esta rodada **não** transforma a plataforma em transmissor oficial de eSocial, emissor fiscal oficial completo ou substituto de responsabilidade técnica/jurídica do cliente.
Ela fecha lacunas importantes de produto e operação para **go-live controlado e enterprise sério**.
