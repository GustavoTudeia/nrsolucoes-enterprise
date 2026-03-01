# NRSoluções — Plataforma Enterprise (End-to-End)

Este repositório (monorepo) contém:

- `backend/`: API FastAPI + PostgreSQL + RBAC + Billing + Afiliados + Auditoria + LGPD (agregação com limiar mínimo) + setorização
- `frontend/`: Next.js (App Router) + Tailwind + shadcn/ui + BFF (proxy) já pronto para chamar o backend

## Como rodar (resumo)

Veja o guia detalhado no arquivo **GUIA_EXECUCAO.md**.

- Backend: `docker compose up -d db redis` + `docker compose up --build backend`
- Frontend: `cd frontend` → `npm install` → `npm run dev`

A API fica em `http://localhost:8000` e o frontend em `http://localhost:3000`.
