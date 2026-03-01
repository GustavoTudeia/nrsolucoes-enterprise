# Guia de Execução (Leigo) — Backend + Frontend (End-to-End)

Este guia assume **Windows 10/11** e uma pessoa iniciante.

## 1) Pré-requisitos (instalar uma vez)

### Obrigatório
1. **Git**  
   - Instale e confirme no terminal:
     - `git --version`

2. **VSCode**  
   - Instale as extensões recomendadas quando o VSCode sugerir (ou veja `.vscode/extensions.json`).

3. **Docker Desktop**  
   - Necessário para rodar **PostgreSQL** e **Redis** sem instalar manualmente.
   - Após instalar, **abra o Docker Desktop** e aguarde ficar “Running”.

4. **Node.js (LTS)**  
   - Recomendado: Node 20+ (LTS).
   - Confirme:
     - `node -v`
     - `npm -v`

### Opcional (se quiser rodar backend fora do Docker)
- **Python 3.11+**
- **pip** e **venv**

> Para iniciante, recomendo: **backend via Docker** + **frontend via npm**.

---

## 2) Criar/Configurar repositório Git (do zero)

### Opção A — Você vai subir para GitHub/GitLab
1. Crie um repositório vazio no GitHub (ex.: `nrsolucoes-enterprise`).
2. No seu PC, crie uma pasta, por exemplo:
   - `C:\Projetos\nrsolucoes-enterprise`
3. Extraia o ZIP deste projeto **dentro** dessa pasta.
4. No terminal dentro da pasta:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: NRSolucoes enterprise end-to-end"
   git branch -M main
   git remote add origin <URL_DO_SEU_REPO>
   git push -u origin main
   ```

### Opção B — Só rodar localmente (sem Git remoto)
Você pode ignorar a parte do Git por enquanto.

---

## 3) Abrir no VSCode (e deixar pronto para debug)

1. Abra o VSCode.
2. Clique em **File → Open Folder...** e selecione a pasta raiz do projeto (onde existe `docker-compose.yml`).
3. Instale as extensões recomendadas quando aparecer o prompt.
4. Abra o terminal do VSCode (**Terminal → New Terminal**).

> Existe um `launch.json` pronto para debug:
- **Backend (uvicorn)**
- **Frontend (Next.js)**

---

## 4) Rodar o BACKEND (API + Banco + Redis) com Docker

### 4.1 Subir serviços
No terminal (na raiz do projeto):

```bash
docker compose up -d db redis
docker compose up --build backend
```

- O `docker compose up backend` já roda:
  - `alembic upgrade head` (migrations)
  - `uvicorn ...` (API)

### 4.2 Confirmar que está OK
- API: `http://localhost:8000/health`
- Docs (Swagger): `http://localhost:8000/docs`

Se algo falhar:
- Ver logs:
  ```bash
  docker compose logs -f backend
  ```
- Reiniciar:
  ```bash
  docker compose down
  docker compose up --build backend
  ```

---

## 5) Rodar o FRONTEND (Next.js) localmente

Em **outro terminal**:

```bash
cd frontend
npm install
npm run dev
```

Abra:
- `http://localhost:3000`

---

## 6) Fluxo “End-to-End” (caminho feliz)

A seguir, um roteiro completo do sistema funcionando (sem “gambiarras” e sem localStorage como fonte de verdade).

### 6.1 Criar conta / Tenant
No navegador:
1. Acesse `http://localhost:3000/cadastre-se`
2. Preencha:
   - **Empresa** (Tenant name)
   - **Slug** (ex.: `minhaempresa`)
   - E-mail e senha
3. Conclua o cadastro.

Depois faça login em:
- `http://localhost:3000/login`

> A conta criada já nasce com um “trial” (entitlements/limits) para liberar recursos de console.

### 6.2 Criar CNPJ e Setores
No Console:
1. Vá em **Organização → CNPJs**
2. Crie um CNPJ (com razão social e número).
3. Vá em **Organização → Setores/Unidades**
4. Crie setores (ex.: RH, Financeiro, Operação).

### 6.3 Criar Template e Versão de Questionário (Builder enterprise)
1. Vá em **Questionários**
2. Em **Criar template**, crie um template (tenant-managed). (Admin da plataforma pode marcar como oficial.)
3. Em **Builder**, modele:
   - Dimensões (ex.: workload, support, autonomy)
   - Perguntas (id, dimensão, peso, escala min/max)
4. Clique em **Criar versão (draft)**
5. Vá em **Publicar** e publique a versão.

> Somente versões **publicadas** podem ser usadas em campanhas.

### 6.4 Criar Campanha e Abrir (Wizard enterprise)
1. No topo do Console, selecione um **CNPJ** (e opcionalmente uma **unidade/setor**)
2. Vá em **Campanhas**
3. Preencha:
   - Nome
   - Unidade/Setor (opcional)
   - Template + Versão publicada (seleção por lista)
4. Clique em **Criar campanha**
5. Na lista, clique em **Abrir**.

### 6.5 Coletar respostas (Página Pública)
Para participar da pesquisa (anônima), use o link:

- `http://localhost:3000/pesquisa/<CAMPAIGN_ID>`

- Se a campanha não for setorizada, a página permite selecionar setor (opcional).
- Ao enviar, as respostas são salvas no backend via:
  - `POST /api/v1/campaigns/{campaign_id}/responses`

### 6.6 Ver Resultados (Agregação)
1. Vá em **Resultados**
2. Selecione a campanha
3. O painel exibe:
   - Respostas, limiar LGPD e se a agregação está liberada
   - Dimensões (geral) e agregados por unidade/setor (quando aplicável)

> Se a agregação estiver bloqueada, a campanha ainda não atingiu o mínimo (`min_anon_threshold`), por padrão 5.

### 6.7 Classificar Risco
1. Vá em **Risco**
2. Selecione campanha + critério e clique em **Classificar**.

### 6.8 Criar Plano de Ação
1. Vá em **Plano de Ação**
2. Selecione uma avaliação de risco
3. Crie o plano
4. Adicione itens (educacionais/organizacionais/administrativos)
5. Adicione evidências (rastreabilidade e auditoria)

### 6.9 Relatórios e Auditoria
1. Vá em **Relatórios (Dossiê)**
2. Selecione o CNPJ no topo e (opcionalmente) filtre por campanha
3. Clique em **Gerar dossiê** e depois **Imprimir/PDF** (Ctrl/Cmd+P)

4. Vá em **Auditoria** para ver eventos (CREATE/UPDATE/...) e detalhes before/after.

### 6.10 LMS (Opcional / Depende do plano)
1. Vá em **LMS**
2. Crie conteúdos
3. Atribua para um setor/unidade (ou para um colaborador)

---

## 7) Rodar o backend fora do Docker (opcional)

Se você quiser (não recomendo para iniciante), você pode rodar o backend com Python local:

1. Entre na pasta:
   ```bash
   cd backend
   ```
2. Crie venv:
   ```bash
   python -m venv .venv
   .\.venv\Scripts\activate
   ```
3. Instale deps:
   ```bash
   pip install -r requirements.txt
   ```
4. Ajuste `backend/.env`:
   - `DATABASE_URL=postgresql+psycopg2://nr:nr@localhost:5432/nrsolucoes`
5. Suba db/redis no Docker:
   ```bash
   docker compose up -d db redis
   ```
6. Rode migrations:
   ```bash
   alembic upgrade head
   ```
7. Rode API:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

---

## 8) Troubleshooting rápido

### Backend sobe, mas frontend não loga
- Confira `frontend/.env.local`:
  - `BACKEND_URL=http://localhost:8000`
  - `BACKEND_BASE_URL=http://localhost:8000/api/v1`

### Erro de CORS
- Confira `backend/.env`:
  - `CORS_ORIGINS=http://localhost:3000`

### Migrations falham
- Veja logs:
  ```bash
  docker compose logs -f backend
  ```
- Reset do banco (DEV):
  ```bash
  docker compose down -v
  docker compose up --build backend
  ```

---

## 9) Observações de “Enterprise”

- Este projeto já inclui:
  - RBAC + escopos (tenant/cnpj/unit)
  - Auditoria (eventos)
  - Isolamento multi-tenant
  - LGPD: **k-anonimato mínimo** para agregação
  - Billing: assinaturas/planos (baseline)
  - Afiliados: tracking de indicações
- Em produção real, você deve:
  - Rotacionar segredos
  - Revisar logs/retention
  - Endurecer políticas de CORS/CSRF
  - Usar migrações controladas e backups
  - Validar NR-1 e LGPD com jurídico/compliance
