# PATCH: Integrar aba de Matrículas no ItemDetailDrawer

## Arquivo: frontend/src/app/(console)/plano-acao/page.tsx

### 1. Adicionar import no início do arquivo (após os outros imports):

```typescript
import EnrollmentsTab from "@/components/action-plan/EnrollmentsTab";
```

Se o componente estiver em outro lugar, ajuste o caminho.

### 2. Adicionar estado para unidades e CNPJs (dentro do componente PlanoAcaoPage):

Localize os estados existentes e adicione:

```typescript
const [orgUnits, setOrgUnits] = useState<Array<{ id: string; name: string }>>([]);
const [cnpjsList, setCnpjsList] = useState<Array<{ id: string; legal_name: string }>>([]);
```

### 3. Carregar unidades e CNPJs (adicionar função e useEffect):

```typescript
async function loadOrgData() {
  try {
    // Assumindo que existe API para buscar unidades e CNPJs
    // Ajuste conforme sua API
    const unitsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/org/units`, {
      headers: { "Authorization": `Bearer ${localStorage.getItem("access_token")}` }
    });
    if (unitsRes.ok) {
      const units = await unitsRes.json();
      setOrgUnits(units.items || units);
    }
    
    const cnpjsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/org/cnpjs`, {
      headers: { "Authorization": `Bearer ${localStorage.getItem("access_token")}` }
    });
    if (cnpjsRes.ok) {
      const cnpjs = await cnpjsRes.json();
      setCnpjsList(cnpjs.items || cnpjs);
    }
  } catch (e) {
    console.error("Erro ao carregar dados org:", e);
  }
}

// Adicionar no useEffect inicial ou criar novo:
useEffect(() => { loadOrgData(); }, []);
```

### 4. Passar props para o ItemDetailDrawer:

Localize onde o ItemDetailDrawer é chamado e adicione as props:

```tsx
<ItemDetailDrawer
  item={selectedItem}
  open={drawerOpen}
  onClose={() => { setDrawerOpen(false); setSelectedItem(null); }}
  onUpdate={() => loadItems(planId)}
  users={users}
  orgUnits={orgUnits}      // ADICIONAR
  cnpjs={cnpjsList}        // ADICIONAR
/>
```

### 5. Atualizar interface do ItemDetailDrawer:

Localize a função ItemDetailDrawer e atualize os props:

```tsx
function ItemDetailDrawer({ item, open, onClose, onUpdate, users, orgUnits = [], cnpjs = [] }: {
  item: ActionItemOut | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
  users: ResponsibleUserInfo[];
  orgUnits?: Array<{ id: string; name: string }>;        // ADICIONAR
  cnpjs?: Array<{ id: string; legal_name: string }>;     // ADICIONAR
}) {
```

### 6. Modificar o TabsList para 5 colunas:

Localize:
```tsx
<TabsList className="grid w-full grid-cols-4">
```

Altere para:
```tsx
<TabsList className="grid w-full grid-cols-5">
```

### 7. Adicionar a nova TabsTrigger:

Localize:
```tsx
<TabsTrigger value="history">Histórico</TabsTrigger>
```

Adicione APÓS:
```tsx
<TabsTrigger value="enrollments" disabled={fullItem?.item_type !== "educational"}>
  Matrículas {fullItem?.enrollment_total ? `(${fullItem.enrollment_completed}/${fullItem.enrollment_total})` : ""}
</TabsTrigger>
```

### 8. Adicionar o TabsContent para matrículas:

Localize o último TabsContent (history) e adicione APÓS ele:

```tsx
<TabsContent value="enrollments" className="m-0">
  {fullItem && (
    <EnrollmentsTab
      itemId={fullItem.id}
      itemType={fullItem.item_type}
      onUpdate={() => {
        onUpdate();
        // Recarrega o item para atualizar stats
        getActionItem(fullItem.id, { include_evidences: true, include_comments: true, include_history: true })
          .then(setFullItem);
      }}
      orgUnits={orgUnits}
      cnpjs={cnpjs}
    />
  )}
</TabsContent>
```

### Código completo da nova aba (para referência):

O TabsContent ficará assim no contexto:

```tsx
</TabsContent>
<TabsContent value="history" className="m-0">
  {/* ... código existente do histórico ... */}
</TabsContent>

{/* NOVA ABA DE MATRÍCULAS */}
<TabsContent value="enrollments" className="m-0">
  {fullItem && (
    <EnrollmentsTab
      itemId={fullItem.id}
      itemType={fullItem.item_type}
      onUpdate={() => {
        onUpdate();
        getActionItem(fullItem.id, { include_evidences: true, include_comments: true, include_history: true })
          .then(setFullItem);
      }}
      orgUnits={orgUnits}
      cnpjs={cnpjs}
    />
  )}
</TabsContent>
```

---

## Resultado Visual Esperado

Após aplicar este patch, o drawer de item terá 5 abas:

1. **Detalhes** - Informações básicas do item
2. **Evidências** - Upload de arquivos e links
3. **Comentários** - Colaboração
4. **Histórico** - Trilha de auditoria
5. **Matrículas** - (NOVA) Gerenciamento de treinamentos

A aba "Matrículas" só estará ativa para itens do tipo "educational".
Ela mostrará:
- Estatísticas de progresso (X de Y concluídos)
- Botão "Matricular" para definir público-alvo
- Botão "Gerar Certificados"
- Lista de colaboradores matriculados com status

---

## Notas Importantes

1. **Dependência**: Certifique-se de que o componente `EnrollmentsTab` existe em `/components/action-plan/EnrollmentsTab.tsx`

2. **API de Treinamentos**: Verifique se os endpoints de trainings estão funcionando:
   - `POST /trainings/items/{id}/enroll`
   - `GET /trainings/items/{id}/enrollments`
   - `GET /trainings/items/{id}/stats`
   - `POST /trainings/items/{id}/certificates/generate`

3. **Tipos**: Certifique-se de que `ActionItemOut` tem os campos de enrollment:
   - `enrollment_total`
   - `enrollment_completed`
   - `enrollment_in_progress`
   - `enrollment_pending`
