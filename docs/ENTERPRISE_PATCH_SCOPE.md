# Enterprise Patch Scope

Este pacote foi ajustado para cobrir, no código, as prioridades de maturidade enterprise Brasil:

1. **Semântica do motor de risco** alinhada entre critério, engine e narrativa.
2. **Workflow de convites** fechado: campanha com convite não aceita resposta aberta.
3. **Billing/entitlements** normalizados com aliases de limites e testes/CI preparados.
4. **Narrativa do produto** migrada para governança/evidência NR-1.
5. **Release limpo**: empacotamento sem `.git`, `node_modules`, `.next`, `.env` e caches.
6. **Suíte/CI**: `pytest.ini` + workflow GitHub Actions para backend.
7. **TODO/print** removidos dos fluxos centrais e substituídos por integrações de e-mail/logging.
8. **Feature-gate no frontend** com base em entitlements do plano.
9. **Core NR-1 ampliado** com template de inventário amplo de perigos/riscos e controles.
10. **eSocial assistido** maturado com `layout_version`, `source_reference` e `traceability`.

## Caveat importante
A emissão fiscal oficial continua dependendo do provedor/credenciais da operação. O pacote entrega:
- workflow operacional completo
- configuração central de faturamento
- sincronização de faturas
- emissão manual ou por webhook fiscal customizado
- trilha e rastreabilidade
