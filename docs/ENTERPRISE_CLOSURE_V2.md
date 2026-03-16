# Enterprise Closure Patch v2

Este patch fecha uma nova rodada de endurecimento técnico e funcional da plataforma, com foco em maturidade enterprise Brasil para NR-1, sem prometer homologação oficial ou substituição de responsabilidade técnica/jurídica da organização.

## Principais entregas

1. **Motor de risco corrigido**
   - Score alto = maturidade/controle melhor = risco menor.
   - Alinhamento entre engine e critério padrão.

2. **Fluxo de campanhas com convite fechado**
   - Campanha controlada por convite passa a operar em modo explícito (`require_invitation`).
   - Submissão pública direta bloqueada quando a campanha exige convite.
   - Convite passa a configurar o modo da campanha automaticamente.

3. **Modelagem corrigida**
   - `campaign.require_invitation` -> boolean.
   - `campaign.invitation_expires_days` -> integer.
   - contadores de convites/lotes -> integer.

4. **Testes e CI**
   - Suíte backend estabilizada.
   - Workflow de CI backend adicionado.
   - Ajustes de ambiente de teste, reset de banco e bypass controlado de aceite legal em `test`.

5. **Autenticação e OTP**
   - Hashing migrado para `pbkdf2_sha256`.
   - Alias `/employee/auth/otp/start` adicionado.
   - Resposta de OTP em `dev/test` inclui `dev_code`.

6. **Feature gating no frontend**
   - Gate por rota/feature no console.
   - Menu e navegação condicionados por entitlements.

7. **Inventário NR-1 ampliado**
   - Biblioteca oficial de perigos/controles.
   - Novo domínio de inventário com aprovação, revisão, risco residual e rastreabilidade.
   - Tela de inventário no console.

8. **Narrativa de produto ampliada**
   - Ajustes de branding e comunicação para governança/evidências NR-1, reduzindo o foco exclusivo em psicossocial.

9. **Finance/Billing**
   - Roteamento de finanças da plataforma exposto.
   - Entitlements mais coerentes para `RISK_INVENTORY`.

## Validação executada

- `python -m compileall backend/app` -> OK
- `pytest -q` em `backend/` -> OK

## Limitações remanescentes

- Emissão fiscal oficial depende de provedor/credenciais/ambiente reais.
- eSocial permanece assistido/exportável, não transmissor oficial completo.
- Aderência integral à NR-1 depende também de processo organizacional, responsabilidade técnica, documentação formal e governança operacional da empresa usuária.
