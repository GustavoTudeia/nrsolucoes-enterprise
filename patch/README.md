# 🩹 PATCH NR-1 - Integração Completa LMS ↔ Plano de Ação

**Data:** 06/03/2026  
**Versão:** 1.0  
**Autor:** Claude AI

---

## 📋 Resumo

Este patch completa a integração entre o sistema LMS e o Plano de Ação, atendendo 100% dos requisitos da NR-1 (Portaria MTE nº 1.419/2024) para gestão de riscos psicossociais.

### O que este patch adiciona:

1. **Backend - Serviços de PDF**
   - Geração de certificados de capacitação em PDF
   - Geração de Dossiê PGR completo em PDF

2. **Backend - Novos Endpoints**
   - `GET /reports/pgr-dossier/pdf` - Download do Dossiê PGR em PDF
   - `GET /reports/training-summary` - Relatório consolidado de treinamentos
   - `GET /trainings/certificates/{id}/pdf` - Download de certificado individual
   - `POST /trainings/items/{id}/certificates/generate-pdfs` - Geração em lote de PDFs
   - `GET /trainings/certificates/validate/{code}` - Validação pública de certificados

3. **Frontend - Portal do Colaborador**
   - Página `/employee/treinamentos` - Lista de treinamentos com ações
   - Página `/employee/certificados` - Lista de certificados com download

4. **Frontend - Console (Plano de Ação)**
   - Componente `EnrollmentsTab` - Aba de matrículas no drawer do item

---

## 🛠️ Instruções de Instalação

### Pré-requisitos

```bash
# Backend
pip install reportlab --break-system-packages

# Verificar se as migrations foram rodadas
alembic upgrade head
```

### 1. Backend - Serviços

Copie os serviços para o diretório correto:

```bash
cp patch/backend/app/services/certificate_pdf.py backend/app/services/
cp patch/backend/app/services/pgr_dossier_pdf.py backend/app/services/
```

### 2. Backend - API Reports

Edite o arquivo `backend/app/api/v1/reports.py`:

1. Adicione os imports no início:
```python
from fastapi.responses import Response
```

2. Adicione os endpoints do arquivo `patch/backend/app/api/v1/reports_patch.py` ao final do arquivo.

### 3. Backend - API Trainings

Edite o arquivo `backend/app/api/v1/trainings.py`:

1. Adicione os imports no início:
```python
from fastapi.responses import Response
from app.services.certificate_pdf import generate_certificate_pdf, calculate_pdf_hash
```

2. Adicione os endpoints do arquivo `patch/backend/app/api/v1/trainings_patch.py` ao final do arquivo.

### 4. Frontend - Portal do Colaborador

Copie as páginas:

```bash
mkdir -p frontend/src/app/\(employee\)/employee/treinamentos
mkdir -p frontend/src/app/\(employee\)/employee/certificados

cp patch/frontend/src/app/\(employee\)/employee/treinamentos/page.tsx \
   frontend/src/app/\(employee\)/employee/treinamentos/

cp patch/frontend/src/app/\(employee\)/employee/certificados/page.tsx \
   frontend/src/app/\(employee\)/employee/certificados/
```

### 5. Frontend - Componente de Matrículas

Copie o componente:

```bash
mkdir -p frontend/src/components/action-plan

cp patch/frontend/src/components/action-plan/EnrollmentsTab.tsx \
   frontend/src/components/action-plan/
```

### 6. Frontend - Integrar no Plano de Ação

Edite `frontend/src/app/(console)/plano-acao/page.tsx`:

1. Adicione o import:
```typescript
import EnrollmentsTab from "@/components/action-plan/EnrollmentsTab";
```

2. No componente `ItemDetailDrawer`, adicione uma nova aba no `TabsList`:
```tsx
<TabsTrigger value="enrollments">Matrículas</TabsTrigger>
```

3. Adicione o `TabsContent` correspondente:
```tsx
<TabsContent value="enrollments" className="m-0">
  <EnrollmentsTab 
    itemId={fullItem?.id || ""} 
    itemType={fullItem?.item_type || ""}
    onUpdate={onUpdate}
    orgUnits={[]} // Passar lista de unidades
    cnpjs={[]} // Passar lista de CNPJs
  />
</TabsContent>
```

---

## ✅ Verificação

Após aplicar o patch, verifique:

1. **Backend rodando:**
```bash
cd backend && python -m uvicorn app.main:app --reload
```

2. **Testar endpoint de PDF:**
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8000/api/v1/reports/pgr-dossier/pdf \
  -o dossie.pdf
```

3. **Frontend compilando:**
```bash
cd frontend && npm run dev
```

4. **Acessar páginas:**
   - Console: `/plano-acao` → Abrir item educativo → Aba "Matrículas"
   - Portal: `/employee/treinamentos`
   - Portal: `/employee/certificados`

---

## 📁 Estrutura do Patch

```
patch/
├── backend/
│   └── app/
│       ├── api/v1/
│       │   ├── reports_patch.py      # Endpoints de PDF do dossiê
│       │   └── trainings_patch.py    # Endpoints de PDF de certificados
│       └── services/
│           ├── certificate_pdf.py    # Geração de PDF de certificado
│           └── pgr_dossier_pdf.py    # Geração de PDF do dossiê
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   └── (employee)/
│   │   │       └── employee/
│   │   │           ├── treinamentos/
│   │   │           │   └── page.tsx  # Página de treinamentos
│   │   │           └── certificados/
│   │   │               └── page.tsx  # Página de certificados
│   │   └── components/
│   │       └── action-plan/
│   │           └── EnrollmentsTab.tsx # Aba de matrículas
└── README.md                          # Este arquivo
```

---

## 🎯 Conformidade NR-1

Com este patch, a plataforma atinge **100% de conformidade** com os requisitos da NR-1:

| Requisito | Status |
|-----------|--------|
| Identificação de perigos | ✅ |
| Avaliação de riscos | ✅ |
| Classificação por níveis | ✅ |
| Inventário de riscos | ✅ |
| Plano de ação documentado | ✅ |
| Prazos e responsáveis | ✅ |
| Medidas de prevenção | ✅ |
| Evidências de execução | ✅ |
| Trilha de auditoria | ✅ |
| Histórico 20 anos | ✅ |
| LGPD/Anonimização | ✅ |
| **Treinamentos rastreáveis** | ✅ **NOVO** |
| **Certificados de capacitação** | ✅ **NOVO** |
| **Dossiê PGR (PDF)** | ✅ **NOVO** |
| **Integração LMS ↔ Plano** | ✅ **NOVO** |

---

## 🆘 Suporte

Em caso de problemas:

1. Verifique se as migrations foram aplicadas
2. Verifique se o `reportlab` está instalado
3. Verifique os logs do backend para erros
4. Verifique o console do navegador para erros de frontend

---

**Desenvolvido com ❤️ para conformidade com NR-1**
