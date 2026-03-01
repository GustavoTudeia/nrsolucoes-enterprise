# Roteiro de Teste End-to-End (NR Soluções Enterprise)

Este documento descreve um roteiro **completo** para validar a plataforma, do primeiro acesso (landing) até os insights e relatórios finais.

> Objetivo: validar fluxos, regras de negócio, UX, segurança, LGPD e pontos críticos que reduzem intervenção humana.

## 1) Pré-requisitos

1. Subir stack local:

   - `docker compose up --build`

2. Se você estiver usando um volume de banco já antigo e aparecer erro de coluna faltando (ex.: `org_unit.is_active`):

   - Recomendado para ambiente local/dev: `docker compose down -v` e subir novamente.
   - A aplicação também possui *bootstrap migrations* (AUTO_MIGRATE_SCHEMA) que tenta corrigir automaticamente.

3. Acessos

   - Frontend: `http://localhost:3000`
   - Backend: `http://localhost:8000`

## 2) Smoke test (sanidade)

1. Abrir a landing page e validar:
   - Header, CTA “Solicitar demonstração” e “Acessar console”.
   - Botão flutuante de **WhatsApp** abre conversa.
   - Responsividade (desktop + mobile).

2. Abrir `/login`:
   - Login com credenciais válidas → redireciona para `/dashboard`.
   - Login com senha inválida → exibe erro (toast e/ou mensagem na UI).

## 3) Onboarding (do zero)

### 3.1 Criar conta / tenant

1. Acessar `/register`.
2. Criar um usuário “Admin do tenant”.
3. Validar:
   - Campos obrigatórios.
   - E-mail em formato válido.
   - Senha mínima/regras (se aplicável).
4. Após criar, validar que consegue:
   - Acessar `/dashboard`.
   - `GET /api/v1/auth/me` retorna dados do usuário.

### 3.2 Aceite legal (LGPD/termos)

1. Acessar área de termos/privacidade (quando disponível).
2. Validar:
   - Registro de aceite.
   - Auditoria (data/hora/usuário).

### 3.3 Assinatura (billing)

1. Em `/dashboard`, checar “status” de assinatura.
2. Validar transições:
   - `trial` → `active` (quando aplicável).
   - Bloqueios quando `inactive` (se aplicável).

## 4) Estrutura organizacional (CNPJs → Unidades/Setores)

### 4.1 Cadastro de CNPJ

1. Ir em **Organização → CNPJs** (`/org/cnpjs`).
2. Cadastrar um CNPJ válido.
3. Validar:
   - Persistência e listagem.
   - Edição.
   - Ativação/desativação (quando aplicável).

#### Testes negativos (obrigatórios)

1. Tentar cadastrar CNPJ inválido (dígitos errados).
2. Esperado:
   - UI bloqueia/mostra erro.
   - API retorna `400` com `detail` explicativo.

### 4.2 Cadastro de Unidades/Setores

1. Ir em **Organização → Unidades** (`/org/unidades`).
2. Selecionar um CNPJ.
3. Criar:
   - Uma unidade “Matriz”.
   - Um setor/área filho (ex.: “Operações”).
4. Validar:
   - Hierarquia (parent_unit_id).
   - Listagem ordenada.
   - Filtros por CNPJ.
   - Flag `is_active` (quando aplicável).

## 5) Diagnóstico e coleta (Questionários → Campanhas)

### 5.1 Questionários

1. Ir em `/questionarios`.
2. Validar:
   - Listagem.
   - Criação/edição.
   - Regras de publicação (draft/published), se existir.

### 5.2 Campanhas

1. Ir em `/campanhas`.
2. Criar campanha:
   - Selecionar CNPJ e unidade/segmentação.
   - Selecionar questionário.
   - Datas de início/fim.
3. Validar:
   - Status (draft/open/closed).
   - Convites (e-mail/links).
   - UX clara para “próximo passo”.

## 6) Resultados, riscos e plano de ação

1. Preencher respostas (fluxo de respondente, quando disponível).
2. Acessar `/resultados`.
3. Validar:
   - Agregações por unidade/segmento.
   - LGPD: anonimização/limites de N mínimo.
   - Classificação de risco (baixo/médio/alto).
4. Plano de ação:
   - Criação de ações.
   - Status (todo/doing/done).
   - Evidências (uploads/links), quando disponível.

## 7) Relatórios e evidências

1. Acessar `/relatorios`.
2. Gerar:
   - Visão executiva (overview).
   - Dossiê de auditoria (PDF/print).
3. Validar:
   - Consistência dos números vs dashboard.
   - Data/hora e escopo (CNPJ/unidade) explícitos.

## 8) Segurança, multi-tenant e qualidade

## 8.5) LMS (Treinamentos)

1. Acessar **LMS** no menu (rota `/lms`).
2. Validar:
   - Catálogo de trilhas/treinamentos.
   - Atribuição de treinamentos por unidade (quando disponível).
   - Indicadores de progresso e conclusão.
   - Export/relatório de conclusão (quando disponível).

### 8.1 RBAC/escopos

1. Criar usuário “Analista” (sem privilégios de admin) e validar permissões.
2. Tentar acessar rotas admin → bloqueio.

### 8.2 Multi-tenant

1. Criar segundo tenant (ou segundo usuário/tenant).
2. Validar isolamento total:
   - CNPJs, unidades, campanhas, resultados e relatórios não vazam.

### 8.3 Observabilidade

1. Logs: confirmar que erros retornam com `detail` e `request_id` (se aplicável).
2. Resiliência: endpoints não podem quebrar UI “silenciosamente”.

## 9) Suporte e redução de intervenção humana

Checklist recomendado:

- ✅ **WhatsApp** sempre disponível (botão flutuante + CTA na landing).
- ✅ Base de conhecimento (FAQ) e trilha de onboarding.
- ✅ Validações em tempo real (CNPJ, e-mail, datas).
- ✅ Alertas de “próximos passos” (dashboard / checklist).
- ✅ Mensagens de erro claras (sem 500 genérico).

---

### Observações

Se algum fluxo ainda não existir (ex.: convites automatizados, canal de respondente, evidências), registre:

1) **Qual é o objetivo** do processo

2) **Quem** executa (admin, analista, colaborador)

3) **Inputs/Outputs**

4) **Regra LGPD**

5) **Automação desejada** (mínima intervenção humana)
