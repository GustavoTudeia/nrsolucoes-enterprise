# Sistema de Gestão de Usuários e Autenticação
## NR Soluções - Especificação Técnica Completa

**Versão:** 2.0  
**Data:** Fevereiro/2026  
**Status:** Aprovado para Implementação

---

## 1. Visão Geral

### 1.1 Objetivo
Implementar um sistema robusto de autenticação e gestão de usuários que atenda:
- Empresas de todos os portes (micro a enterprise)
- Realidade brasileira (colaboradores sem email)
- Multi-tenancy com isolamento de dados
- Conformidade LGPD

### 1.2 Princípios
1. **Simplicidade**: Login por email, sem exigir CNPJ
2. **Flexibilidade**: Múltiplos métodos de autenticação
3. **Segurança**: Senhas fortes, auditoria completa
4. **Inclusão**: Acesso para colaboradores sem email

---

## 2. Entidades e Modelo de Dados

### 2.1 Diagrama ER Simplificado

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   TENANT    │──1:N──│    CNPJ     │──1:N──│  ORG_UNIT   │
│  (Conta)    │       │  (Empresa)  │       │  (Setor)    │
└─────────────┘       └─────────────┘       └─────────────┘
       │                     │                     │
       │                     │                     │
       │              ┌──────┴──────┐              │
       │              │             │              │
       ▼              ▼             ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐
│    USER     │ │ COLLABORATOR│ │   USER_ROLE_SCOPE   │
│  (Usuário)  │ │(Colaborador)│ │    (Permissões)     │
└─────────────┘ └─────────────┘ └─────────────────────┘
       │              │
       └──────┬───────┘
              │
              ▼
       (vínculo opcional)
```

### 2.2 Tabela: USER (user_account)

Usuários com acesso ao console administrativo.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | UUID | Sim | PK |
| email | VARCHAR(200) | Sim* | Email único global |
| cpf | VARCHAR(14) | Sim* | CPF único global (alternativa ao email) |
| full_name | VARCHAR(200) | Sim | Nome completo |
| password_hash | VARCHAR(500) | Sim | Senha criptografada (bcrypt) |
| phone | VARCHAR(20) | Não | Telefone com DDD |
| is_active | BOOLEAN | Sim | Usuário ativo |
| is_platform_admin | BOOLEAN | Sim | Admin da plataforma |
| must_change_password | BOOLEAN | Sim | Forçar troca de senha |
| last_login_at | TIMESTAMP | Não | Último login |
| login_count | INTEGER | Sim | Contador de logins |
| failed_login_count | INTEGER | Sim | Tentativas falhas consecutivas |
| locked_until | TIMESTAMP | Não | Bloqueio temporário |
| invited_by_user_id | UUID | Não | FK → user_account |
| invited_at | TIMESTAMP | Não | Data do convite |
| password_changed_at | TIMESTAMP | Não | Última troca de senha |
| created_at | TIMESTAMP | Sim | Criação |
| updated_at | TIMESTAMP | Sim | Atualização |

*Pelo menos um (email ou cpf) é obrigatório

**Índices:**
- UNIQUE(email) WHERE email IS NOT NULL
- UNIQUE(cpf) WHERE cpf IS NOT NULL
- INDEX(phone)

### 2.3 Tabela: ROLE (role)

Papéis disponíveis no sistema.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | UUID | Sim | PK |
| key | VARCHAR(60) | Sim | Chave única (OWNER, ADMIN, etc) |
| name | VARCHAR(120) | Sim | Nome de exibição |
| description | TEXT | Não | Descrição do papel |
| is_system | BOOLEAN | Sim | Papel do sistema (não editável) |
| permissions | JSONB | Não | Lista de permissões |
| created_at | TIMESTAMP | Sim | Criação |

**Papéis do Sistema:**

| Key | Nome | Descrição |
|-----|------|-----------|
| OWNER | Proprietário | Dono da conta. 1 por tenant. |
| TENANT_ADMIN | Administrador | Acesso total exceto billing |
| CNPJ_MANAGER | Gestor de Empresa | Acesso a CNPJs específicos |
| UNIT_MANAGER | Gestor de Unidade | Acesso a unidades específicas |
| SST_TECH | Técnico SST | Acesso técnico de segurança |
| VIEWER | Visualizador | Somente leitura |

### 2.4 Tabela: USER_ROLE_SCOPE (user_role_scope)

Atribuição de papéis com escopo.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | UUID | Sim | PK |
| user_id | UUID | Sim | FK → user_account |
| role_id | UUID | Sim | FK → role |
| tenant_id | UUID | Sim | FK → tenant (sempre preenchido) |
| cnpj_id | UUID | Não | FK → cnpj (se escopo restrito) |
| org_unit_id | UUID | Não | FK → org_unit (se escopo restrito) |
| granted_by_user_id | UUID | Não | Quem concedeu |
| granted_at | TIMESTAMP | Sim | Quando concedeu |
| expires_at | TIMESTAMP | Não | Expiração (para acessos temporários) |
| is_active | BOOLEAN | Sim | Ativo |
| created_at | TIMESTAMP | Sim | Criação |

**Regras:**
- Se cnpj_id = NULL e org_unit_id = NULL → acesso a todo tenant
- Se cnpj_id preenchido e org_unit_id = NULL → acesso a todo CNPJ
- Se org_unit_id preenchido → acesso apenas àquela unidade

### 2.5 Tabela: USER_INVITATION (user_invitation)

Convites pendentes.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | UUID | Sim | PK |
| tenant_id | UUID | Sim | FK → tenant |
| email | VARCHAR(200) | Sim | Email do convidado |
| full_name | VARCHAR(200) | Não | Nome sugerido |
| role_key | VARCHAR(60) | Sim | Papel a ser atribuído |
| cnpj_id | UUID | Não | Escopo CNPJ |
| org_unit_id | UUID | Não | Escopo Unidade |
| token | VARCHAR(100) | Sim | Token único do convite |
| invited_by_user_id | UUID | Sim | Quem convidou |
| expires_at | TIMESTAMP | Sim | Expiração (7 dias) |
| accepted_at | TIMESTAMP | Não | Quando aceitou |
| created_user_id | UUID | Não | Usuário criado |
| status | VARCHAR(20) | Sim | pending/accepted/expired/cancelled |
| created_at | TIMESTAMP | Sim | Criação |

### 2.6 Tabela: EMPLOYEE (employee) - Atualização

Adicionar campos para autenticação.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| ... campos existentes ... |
| linked_user_id | UUID | Não | FK → user_account (se tem acesso console) |
| portal_access_enabled | BOOLEAN | Sim | Pode acessar portal |
| portal_password_hash | VARCHAR(500) | Não | Senha do portal |
| portal_must_change_password | BOOLEAN | Sim | Forçar troca |
| portal_last_login_at | TIMESTAMP | Não | Último acesso portal |
| preferred_contact | VARCHAR(20) | Não | email/sms/whatsapp |

### 2.7 Tabela: AUTH_TOKEN (auth_token)

Tokens de autenticação (magic links, OTP, reset).

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | UUID | Sim | PK |
| token_type | VARCHAR(30) | Sim | magic_link/otp/password_reset/invitation |
| token_hash | VARCHAR(100) | Sim | Hash do token |
| user_id | UUID | Não | FK → user_account |
| employee_id | UUID | Não | FK → employee |
| email | VARCHAR(200) | Não | Email alvo |
| phone | VARCHAR(20) | Não | Telefone alvo |
| otp_code | VARCHAR(6) | Não | Código OTP (se aplicável) |
| expires_at | TIMESTAMP | Sim | Expiração |
| used_at | TIMESTAMP | Não | Quando usado |
| ip_address | VARCHAR(45) | Não | IP de criação |
| user_agent | TEXT | Não | User agent |
| created_at | TIMESTAMP | Sim | Criação |

### 2.8 Tabela: AUTH_AUDIT_LOG (auth_audit_log)

Log de eventos de autenticação.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | UUID | Sim | PK |
| event_type | VARCHAR(50) | Sim | Tipo do evento |
| user_id | UUID | Não | FK → user_account |
| employee_id | UUID | Não | FK → employee |
| tenant_id | UUID | Não | FK → tenant |
| email | VARCHAR(200) | Não | Email usado |
| cpf | VARCHAR(14) | Não | CPF usado |
| success | BOOLEAN | Sim | Sucesso ou falha |
| failure_reason | VARCHAR(100) | Não | Motivo da falha |
| ip_address | VARCHAR(45) | Não | IP |
| user_agent | TEXT | Não | User agent |
| location_country | VARCHAR(2) | Não | País (GeoIP) |
| location_city | VARCHAR(100) | Não | Cidade (GeoIP) |
| metadata | JSONB | Não | Dados adicionais |
| created_at | TIMESTAMP | Sim | Criação |

**Tipos de evento:**
- LOGIN_SUCCESS, LOGIN_FAILED
- LOGOUT
- PASSWORD_CHANGE, PASSWORD_RESET_REQUEST, PASSWORD_RESET_COMPLETE
- MFA_SUCCESS, MFA_FAILED
- INVITATION_SENT, INVITATION_ACCEPTED
- ACCOUNT_LOCKED, ACCOUNT_UNLOCKED
- SESSION_EXPIRED

---

## 3. Fluxos de Autenticação

### 3.1 Login por Email + Senha

```
┌─────────────────────────────────────────────────────────────────┐
│                      FLUXO: LOGIN EMAIL                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  USUÁRIO                          SISTEMA                       │
│  ────────                         ────────                      │
│                                                                 │
│  1. Acessa /login                                               │
│     ↓                                                           │
│  2. Digita email + senha                                        │
│     ↓                                                           │
│  3. Clica "Entrar"                                              │
│     ────────────────────────────→                               │
│                                   4. Valida email existe        │
│                                      ↓                          │
│                                   5. Verifica conta bloqueada?  │
│                                      ↓ (não)                    │
│                                   6. Valida senha (bcrypt)      │
│                                      ↓                          │
│                                   7. Senha correta?             │
│                                      │                          │
│                          ┌───────────┴───────────┐              │
│                          ↓ SIM                   ↓ NÃO          │
│                    8. Reseta contador      8. Incrementa        │
│                       failed_login            failed_login      │
│                          ↓                       ↓              │
│                    9. Atualiza              9. >= 5 tentativas? │
│                       last_login                 │              │
│                          ↓                  ┌────┴────┐         │
│                    10. Gera JWT             ↓ SIM     ↓ NÃO     │
│                          ↓              Bloqueia   Retorna      │
│                    11. Usuário tem          30min    erro       │
│                        múltiplos tenants?                       │
│                          │                                      │
│               ┌──────────┴──────────┐                           │
│               ↓ SIM                 ↓ NÃO                       │
│         12. Tela seleção       12. Redireciona                  │
│             tenant                 dashboard                    │
│               ↓                                                 │
│         13. Seleciona tenant                                    │
│               ↓                                                 │
│         14. Redireciona dashboard                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Login por CPF + Senha

```
┌─────────────────────────────────────────────────────────────────┐
│                      FLUXO: LOGIN CPF                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Mesmo fluxo do email, mas:                                     │
│  - Campo de entrada: CPF (com máscara)                          │
│  - Busca por user.cpf OU employee.cpf                           │
│  - Se employee, usa portal_password_hash                        │
│                                                                 │
│  TELA:                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                        ENTRAR                            │   │
│  │                                                          │   │
│  │  ┌──────────┐  ┌──────────┐                             │   │
│  │  │  Email   │  │   CPF    │  ← Toggle                   │   │
│  │  └──────────┘  └──────────┘                             │   │
│  │                    ▲ selecionado                        │   │
│  │                                                          │   │
│  │  CPF:      [123.456.789-00               ]              │   │
│  │  Senha:    [••••••••••                   ]              │   │
│  │                                                          │   │
│  │            [Entrar]                                      │   │
│  │                                                          │   │
│  │  Esqueci minha senha                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Login por CPF + OTP (SMS)

```
┌─────────────────────────────────────────────────────────────────┐
│                      FLUXO: LOGIN OTP                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PASSO 1: Identificação                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  CPF: [123.456.789-00]                                  │   │
│  │                                                          │   │
│  │  [Continuar]                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SISTEMA:                                                       │
│  1. Busca usuário/colaborador pelo CPF                          │
│  2. Verifica se tem telefone cadastrado                         │
│  3. Gera código OTP de 6 dígitos                                │
│  4. Armazena hash do código (expira em 5 min)                   │
│  5. Envia SMS: "Seu código NR Soluções: 123456"                │
│                                                                 │
│  PASSO 2: Verificação                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Enviamos um código para (11) 9****-7890                │   │
│  │                                                          │   │
│  │  Código: [1] [2] [3] [4] [5] [6]                        │   │
│  │                                                          │   │
│  │  [Verificar]                                            │   │
│  │                                                          │   │
│  │  Não recebeu? [Reenviar SMS] [Tentar outro método]     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SISTEMA:                                                       │
│  1. Valida código com hash armazenado                           │
│  2. Se válido, gera sessão                                      │
│  3. Se inválido, incrementa contador                            │
│  4. 3 tentativas erradas = novo código necessário               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Magic Link (WhatsApp/Email)

```
┌─────────────────────────────────────────────────────────────────┐
│                      FLUXO: MAGIC LINK                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SOLICITAÇÃO:                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Receba um link de acesso no seu:                       │   │
│  │                                                          │   │
│  │  ○ Email                                                │   │
│  │  ● WhatsApp                                             │   │
│  │                                                          │   │
│  │  Telefone: [(11) 98765-4321        ]                    │   │
│  │                                                          │   │
│  │  [Enviar Link]                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SISTEMA:                                                       │
│  1. Busca usuário pelo telefone                                 │
│  2. Gera token único (UUID)                                     │
│  3. Armazena hash com expiração (15 min)                        │
│  4. Envia mensagem com link:                                    │
│     https://app.nrsolucoes.com.br/auth/magic/{token}           │
│                                                                 │
│  MENSAGEM WHATSAPP:                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🔐 NR Soluções                                         │   │
│  │                                                          │   │
│  │  Olá! Clique no link abaixo para acessar sua conta:    │   │
│  │                                                          │   │
│  │  👉 https://app.nrsolucoes.com.br/auth/magic/abc123    │   │
│  │                                                          │   │
│  │  Este link expira em 15 minutos.                        │   │
│  │                                                          │   │
│  │  Se você não solicitou, ignore esta mensagem.          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  VALIDAÇÃO DO LINK:                                             │
│  1. Usuário clica no link                                       │
│  2. Sistema valida token                                        │
│  3. Se válido e não expirado:                                   │
│     - Marca token como usado                                    │
│     - Cria sessão                                               │
│     - Redireciona para dashboard                                │
│  4. Se inválido: mensagem de erro                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.5 Recuperação de Senha

```
┌─────────────────────────────────────────────────────────────────┐
│                   FLUXO: RECUPERAR SENHA                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PASSO 1: Solicitação                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Esqueceu sua senha?                                    │   │
│  │                                                          │   │
│  │  Digite seu email ou CPF:                               │   │
│  │  [carlos@empresa.com.br              ]                  │   │
│  │                                                          │   │
│  │  [Enviar Link de Recuperação]                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SISTEMA:                                                       │
│  1. Busca usuário por email OU CPF                              │
│  2. SEMPRE mostra mensagem de sucesso (segurança)               │
│  3. Se encontrou:                                               │
│     - Gera token de reset (expira 1h)                           │
│     - Envia email com link                                      │
│     - Se tem telefone, opção de SMS                             │
│                                                                 │
│  PASSO 2: Redefinição                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Criar nova senha                                       │   │
│  │                                                          │   │
│  │  Nova senha:      [••••••••••              ]            │   │
│  │  Confirmar:       [••••••••••              ]            │   │
│  │                                                          │   │
│  │  Requisitos:                                            │   │
│  │  ✅ Mínimo 8 caracteres                                 │   │
│  │  ✅ Pelo menos 1 número                                 │   │
│  │  ⬜ Pelo menos 1 maiúscula                              │   │
│  │  ⬜ Pelo menos 1 caractere especial                     │   │
│  │                                                          │   │
│  │  [Redefinir Senha]                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SISTEMA:                                                       │
│  1. Valida token                                                │
│  2. Valida força da senha                                       │
│  3. Atualiza password_hash                                      │
│  4. Invalida token                                              │
│  5. Invalida todas as sessões ativas                            │
│  6. Registra no audit log                                       │
│  7. Redireciona para login                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Fluxo de Convite

### 4.1 Convidar Novo Usuário

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO: CONVIDAR USUÁRIO                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ADMIN ACESSA: Configurações > Usuários > Convidar             │
│                                                                 │
│  FORMULÁRIO:                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  CONVIDAR NOVO USUÁRIO                                  │   │
│  │                                                          │   │
│  │  Email: *          [maria@gmail.com            ]        │   │
│  │  Nome:             [Maria Silva                ]        │   │
│  │                                                          │   │
│  │  Papel: *          [Gestor de Unidade ▼]                │   │
│  │                                                          │   │
│  │  ┌─ Escopo de Acesso ─────────────────────────────────┐ │   │
│  │  │                                                     │ │   │
│  │  │  ○ Toda a empresa                                  │ │   │
│  │  │  ● Empresas específicas (CNPJs)                    │ │   │
│  │  │    ☑ Matriz (12.345.678/0001-90)                   │ │   │
│  │  │    ☐ Filial RJ (12.345.678/0002-71)                │ │   │
│  │  │                                                     │ │   │
│  │  │  ● Unidades específicas                            │ │   │
│  │  │    ☑ Produção                                      │ │   │
│  │  │    ☑ Manutenção                                    │ │   │
│  │  │    ☐ Administrativo                                │ │   │
│  │  │                                                     │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                          │   │
│  │  ┌─ Opções ───────────────────────────────────────────┐ │   │
│  │  │  ☐ Acesso temporário (expira em __ dias)          │ │   │
│  │  │  ☐ Vincular a colaborador existente               │ │   │
│  │  │    [Selecionar colaborador ▼]                      │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                          │   │
│  │  [Cancelar]                          [Enviar Convite]   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SISTEMA:                                                       │
│  1. Valida email não é usuário existente no tenant              │
│  2. Cria registro em user_invitation                            │
│  3. Gera token único                                            │
│  4. Envia email de convite                                      │
│  5. Registra no audit log                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Email de Convite

```
┌─────────────────────────────────────────────────────────────────┐
│  📧 EMAIL DE CONVITE                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  De: NR Soluções <noreply@nrsolucoes.com.br>                   │
│  Para: maria@gmail.com                                          │
│  Assunto: Você foi convidado para NR Soluções                  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    [LOGO NR SOLUÇÕES]                   │   │
│  │                                                          │   │
│  │  Olá Maria,                                              │   │
│  │                                                          │   │
│  │  Carlos Silva (carlos@metalurgica.com.br) convidou      │   │
│  │  você para acessar a plataforma NR Soluções.            │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │  🏢 Empresa: Metalúrgica XYZ Ltda               │    │   │
│  │  │  📋 CNPJ: 12.345.678/0001-90                    │    │   │
│  │  │  👔 Seu papel: Gestor de Unidade                │    │   │
│  │  │  📍 Acesso: Produção, Manutenção                │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │           ┌────────────────────────────┐                │   │
│  │           │  Aceitar Convite e Entrar  │                │   │
│  │           └────────────────────────────┘                │   │
│  │                                                          │   │
│  │  Este convite expira em 7 dias.                         │   │
│  │                                                          │   │
│  │  Se você não reconhece este convite, ignore             │   │
│  │  este email.                                            │   │
│  │                                                          │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  NR Soluções - Gestão de Riscos Psicossociais          │   │
│  │  www.nrsolucoes.com.br                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Aceitar Convite - Usuário Novo

```
┌─────────────────────────────────────────────────────────────────┐
│              FLUXO: ACEITAR CONVITE (NOVO USUÁRIO)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Usuário clica no link do email                              │
│  2. Sistema valida token                                        │
│  3. Verifica se email já existe no sistema                      │
│     → NÃO existe: Tela de criação de conta                      │
│                                                                 │
│  TELA:                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  🏢 Metalúrgica XYZ Ltda                                │   │
│  │                                                          │   │
│  │  Bem-vinda, Maria!                                      │   │
│  │                                                          │   │
│  │  Crie sua conta para acessar a plataforma:              │   │
│  │                                                          │   │
│  │  Email:           maria@gmail.com (não editável)        │   │
│  │                                                          │   │
│  │  Nome completo: * [Maria Silva                ]         │   │
│  │  CPF:             [123.456.789-00             ]         │   │
│  │  Telefone:        [(11) 98765-4321            ]         │   │
│  │                                                          │   │
│  │  Senha: *         [••••••••••                 ]         │   │
│  │  Confirmar: *     [••••••••••                 ]         │   │
│  │                                                          │   │
│  │  Requisitos da senha:                                   │   │
│  │  ✅ Mínimo 8 caracteres                                 │   │
│  │  ✅ Pelo menos 1 número                                 │   │
│  │  ✅ Pelo menos 1 maiúscula                              │   │
│  │                                                          │   │
│  │  ☑ Li e aceito os Termos de Uso e Política de          │   │
│  │    Privacidade                                          │   │
│  │                                                          │   │
│  │  [Criar Conta e Entrar]                                 │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SISTEMA:                                                       │
│  1. Cria usuário em user_account                                │
│  2. Cria papel em user_role_scope                               │
│  3. Atualiza invitation (accepted_at, created_user_id)          │
│  4. Registra aceite de termos                                   │
│  5. Cria sessão                                                 │
│  6. Redireciona para dashboard                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Aceitar Convite - Usuário Existente

```
┌─────────────────────────────────────────────────────────────────┐
│            FLUXO: ACEITAR CONVITE (USUÁRIO EXISTENTE)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Cenário: Maria já usa a plataforma na empresa "Consultoria"    │
│  Agora foi convidada para "Metalúrgica XYZ"                    │
│                                                                 │
│  1. Maria clica no link do email                                │
│  2. Sistema valida token                                        │
│  3. Verifica se email já existe → SIM                          │
│  4. Mostra tela de confirmação:                                 │
│                                                                 │
│  TELA:                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  Olá Maria!                                              │   │
│  │                                                          │   │
│  │  Você foi convidada para acessar uma nova empresa:      │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │  🏭 Metalúrgica XYZ Ltda                        │    │   │
│  │  │  📋 CNPJ: 12.345.678/0001-90                    │    │   │
│  │  │  👔 Papel: Gestor de Unidade                    │    │   │
│  │  │  📍 Acesso: Produção, Manutenção                │    │   │
│  │  │  👤 Convidado por: Carlos Silva                 │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │  Você já tem acesso a:                                  │   │
│  │  • Consultoria ABC (Admin)                              │   │
│  │                                                          │   │
│  │  Ao aceitar, você poderá alternar entre as empresas    │   │
│  │  usando a mesma conta.                                  │   │
│  │                                                          │   │
│  │  [Recusar]                      [Aceitar Convite]       │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SISTEMA (se aceitar):                                          │
│  1. Adiciona novo papel em user_role_scope                      │
│  2. Atualiza invitation                                         │
│  3. Redireciona para seleção de empresa                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Gestão de Usuários (Console)

### 5.1 Tela: Lista de Usuários

```
┌─────────────────────────────────────────────────────────────────┐
│  USUÁRIOS                                        [+ Convidar]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Filtros: [Todos ▼] [Todos os papéis ▼] [Buscar...        ] 🔍 │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 👤 │ Nome          │ Email              │ Papel    │ Status ││
│  ├────┼───────────────┼────────────────────┼──────────┼────────┤│
│  │ CS │ Carlos Silva  │ carlos@metal...    │ Owner    │ ✅     ││
│  │    │               │ Último: hoje 14:30 │          │        ││
│  ├────┼───────────────┼────────────────────┼──────────┼────────┤│
│  │ MS │ Maria Silva   │ maria@gmail.com    │ Gestor   │ ✅     ││
│  │    │               │ Último: ontem      │ Produção │        ││
│  ├────┼───────────────┼────────────────────┼──────────┼────────┤│
│  │ RS │ Ricardo SST   │ ricardo@sst.com    │ SST      │ ✅     ││
│  │    │               │ Último: 3 dias     │          │        ││
│  ├────┼───────────────┼────────────────────┼──────────┼────────┤│
│  │ 📧 │ (Pendente)    │ joao@empresa.com   │ Gestor   │ ⏳     ││
│  │    │               │ Convite: 2 dias    │ Manut.   │ Aguard.││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Mostrando 4 de 4 usuários                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Tela: Detalhes do Usuário

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Voltar                                                       │
│                                                                 │
│  ┌───────┐  Maria Silva                                        │
│  │  MS   │  maria@gmail.com                                    │
│  └───────┘  Membro desde: 15/01/2026                           │
│             Último acesso: ontem às 16:45                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  INFORMAÇÕES                                         [Editar]   │
│  ─────────────────────────────────────────────────────────────  │
│  Email:     maria@gmail.com                                    │
│  CPF:       123.456.789-00                                     │
│  Telefone:  (11) 98765-4321                                    │
│  Status:    ✅ Ativo                                            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  PAPÉIS E ACESSOS                                   [Editar]    │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  👔 Gestor de Unidade                                          │
│     Escopo: Produção, Manutenção                               │
│     Concedido por: Carlos Silva em 15/01/2026                  │
│     [Remover papel]                                            │
│                                                                 │
│  [+ Adicionar outro papel]                                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  VÍNCULO COM COLABORADOR                                        │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ☑ Este usuário é colaborador da empresa                       │
│  Colaborador: Maria Silva - Produção - Coordenadora            │
│  [Alterar vínculo]                                             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  AÇÕES                                                          │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [Redefinir senha]  [Desativar usuário]  [Remover do sistema]  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  HISTÓRICO DE ACESSO (últimos 30 dias)              [Ver mais]  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  • Ontem 16:45 - Login - São Paulo, BR                         │
│  • 12/02 09:30 - Login - São Paulo, BR                         │
│  • 10/02 14:15 - Alterou senha                                 │
│  • 08/02 11:00 - Login - São Paulo, BR                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Portal do Colaborador

### 6.1 Configuração de Acesso (Admin)

```
┌─────────────────────────────────────────────────────────────────┐
│  CONFIGURAÇÕES > PORTAL DO COLABORADOR                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STATUS                                                         │
│  ─────────────────────────────────────────────────────────────  │
│  ☑ Portal do colaborador habilitado                            │
│                                                                 │
│  MÉTODOS DE ACESSO                                              │
│  ─────────────────────────────────────────────────────────────  │
│  ☑ Email + Senha                                               │
│  ☑ CPF + Senha                                                 │
│  ☑ CPF + OTP (SMS)                     Custo: ~R$0,08/login   │
│  ☐ Magic Link WhatsApp                 Custo: ~R$0,30/msg     │
│                                                                 │
│  SENHA PADRÃO PARA NOVOS COLABORADORES                         │
│  ─────────────────────────────────────────────────────────────  │
│  ○ Gerar senha aleatória (enviar por email/SMS)               │
│  ● Usar CPF como senha inicial (forçar troca no 1º acesso)    │
│  ○ Definir senha padrão: [**********]                         │
│                                                                 │
│  FUNCIONALIDADES DO PORTAL                                      │
│  ─────────────────────────────────────────────────────────────  │
│  ☑ Ver pesquisas pendentes                                     │
│  ☑ Responder pesquisas                                         │
│  ☑ Ver treinamentos atribuídos                                 │
│  ☑ Realizar treinamentos                                       │
│  ☐ Ver suas próprias respostas anteriores                     │
│  ☐ Ver certificados                                            │
│                                                                 │
│  [Cancelar]                                           [Salvar]  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Habilitar Acesso ao Portal (por Colaborador)

```
┌─────────────────────────────────────────────────────────────────┐
│  COLABORADOR: José Santos                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ACESSO AO PORTAL                                               │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Status: ☑ Acesso habilitado                                   │
│                                                                 │
│  ┌─ Métodos de Login ─────────────────────────────────────────┐│
│  │                                                             ││
│  │  Identificador: CPF 123.456.789-00                         ││
│  │                                                             ││
│  │  ☑ Senha                                                   ││
│  │    Status: Definida em 10/02/2026                          ││
│  │    [Redefinir senha]                                       ││
│  │                                                             ││
│  │  ☑ OTP por SMS                                             ││
│  │    Telefone: (11) 98765-4321                               ││
│  │                                                             ││
│  │  ☐ OTP por WhatsApp                                        ││
│  │    (requer plano Enterprise)                               ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ÚLTIMO ACESSO                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  12/02/2026 às 14:30 - São Paulo, BR                           │
│                                                                 │
│  [Enviar link de acesso por SMS]                               │
│  [Enviar instruções por WhatsApp]                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Segurança

### 7.1 Políticas de Senha

```
┌─────────────────────────────────────────────────────────────────┐
│  POLÍTICAS DE SENHA                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  REQUISITOS MÍNIMOS (não configurável):                        │
│  • Mínimo 8 caracteres                                         │
│  • Pelo menos 1 letra                                          │
│  • Pelo menos 1 número                                         │
│  • Não pode ser igual ao email                                 │
│  • Não pode ser senha comum (lista de 10.000)                  │
│                                                                 │
│  REQUISITOS ADICIONAIS (configurável por tenant):              │
│  ☐ Exigir letra maiúscula                                     │
│  ☐ Exigir caractere especial                                  │
│  ☐ Mínimo 12 caracteres                                       │
│  ☐ Expiração de senha a cada [90] dias                        │
│  ☐ Não repetir últimas [5] senhas                             │
│                                                                 │
│  BLOQUEIO DE CONTA:                                             │
│  • Após [5] tentativas falhas consecutivas                     │
│  • Bloqueio por [30] minutos                                   │
│  • Notificar usuário por email                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Sessões

```
┌─────────────────────────────────────────────────────────────────┐
│  CONFIGURAÇÃO DE SESSÕES                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  JWT (Access Token):                                            │
│  • Duração: 15 minutos                                         │
│  • Renovação automática com refresh token                      │
│                                                                 │
│  Refresh Token:                                                 │
│  • Duração: 7 dias                                             │
│  • Rotação a cada uso                                          │
│  • Invalidar ao trocar senha                                   │
│                                                                 │
│  Sessões múltiplas:                                             │
│  • Permitir múltiplos dispositivos                             │
│  • Limite: [5] sessões ativas por usuário                      │
│  • Ao exceder, remove sessão mais antiga                       │
│                                                                 │
│  Timeout de inatividade:                                        │
│  • Console: [30] minutos                                       │
│  • Portal colaborador: [60] minutos                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. APIs

### 8.1 Endpoints de Autenticação

```
POST /api/v1/auth/login
  Body: { "email": "...", "password": "..." }
  Body: { "cpf": "...", "password": "..." }
  Response: { "access_token": "...", "refresh_token": "...", "user": {...}, "tenants": [...] }

POST /api/v1/auth/login/otp/request
  Body: { "cpf": "...", "method": "sms|whatsapp" }
  Response: { "message": "Código enviado", "masked_phone": "(11) 9****-7890" }

POST /api/v1/auth/login/otp/verify
  Body: { "cpf": "...", "code": "123456" }
  Response: { "access_token": "...", ... }

POST /api/v1/auth/login/magic-link/request
  Body: { "phone": "...", "method": "sms|whatsapp" }
  Response: { "message": "Link enviado" }

GET /api/v1/auth/magic-link/{token}
  Response: Redirect ou { "access_token": "...", ... }

POST /api/v1/auth/refresh
  Body: { "refresh_token": "..." }
  Response: { "access_token": "...", "refresh_token": "..." }

POST /api/v1/auth/logout
  Response: { "message": "Logout realizado" }

POST /api/v1/auth/password/reset/request
  Body: { "email_or_cpf": "..." }
  Response: { "message": "Se existe, enviamos instruções" }

POST /api/v1/auth/password/reset/verify
  Body: { "token": "...", "new_password": "..." }
  Response: { "message": "Senha alterada" }

POST /api/v1/auth/password/change
  Body: { "current_password": "...", "new_password": "..." }
  Response: { "message": "Senha alterada" }

POST /api/v1/auth/select-tenant
  Body: { "tenant_id": "..." }
  Response: { "access_token": "...", "tenant": {...} }
```

### 8.2 Endpoints de Gestão de Usuários

```
GET /api/v1/users
  Query: ?role=&status=&q=&limit=&offset=
  Response: { "items": [...], "total": 100 }

GET /api/v1/users/{user_id}
  Response: { "id": "...", "email": "...", "roles": [...], ... }

PATCH /api/v1/users/{user_id}
  Body: { "full_name": "...", "phone": "...", "is_active": true }
  Response: { "id": "..." }

DELETE /api/v1/users/{user_id}
  Response: { "deleted": true }

POST /api/v1/users/{user_id}/roles
  Body: { "role_key": "GESTOR", "cnpj_id": "...", "org_unit_id": "..." }
  Response: { "id": "..." }

DELETE /api/v1/users/{user_id}/roles/{role_scope_id}
  Response: { "deleted": true }

POST /api/v1/users/{user_id}/reset-password
  Response: { "message": "Email enviado" }

POST /api/v1/users/{user_id}/deactivate
  Response: { "message": "Usuário desativado" }

POST /api/v1/users/{user_id}/reactivate
  Response: { "message": "Usuário reativado" }
```

### 8.3 Endpoints de Convites

```
GET /api/v1/invitations
  Query: ?status=pending&limit=&offset=
  Response: { "items": [...], "total": 10 }

POST /api/v1/invitations
  Body: { "email": "...", "full_name": "...", "role_key": "...", "cnpj_id": "...", "org_unit_id": "...", "expires_days": 7 }
  Response: { "id": "...", "token": "..." }

DELETE /api/v1/invitations/{invitation_id}
  Response: { "cancelled": true }

POST /api/v1/invitations/{invitation_id}/resend
  Response: { "message": "Reenviado" }

GET /api/v1/invitations/validate/{token}
  Response: { "valid": true, "invitation": {...}, "user_exists": false }

POST /api/v1/invitations/accept/{token}
  Body: { "full_name": "...", "password": "...", "cpf": "...", "phone": "..." }
  Response: { "access_token": "...", "user": {...} }

POST /api/v1/invitations/accept-existing/{token}
  Response: { "access_token": "...", "message": "Acesso adicionado" }
```

---

## 9. Migrações de Banco

### 9.1 Novas Colunas em user_account

```sql
-- Adicionar campos de autenticação
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0;
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS invited_by_user_id UUID;
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP;
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS ix_user_account_cpf ON user_account(cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_user_account_phone ON user_account(phone) WHERE phone IS NOT NULL;
```

### 9.2 Nova Tabela: user_invitation

```sql
CREATE TABLE IF NOT EXISTS user_invitation (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    email VARCHAR(200) NOT NULL,
    full_name VARCHAR(200),
    role_key VARCHAR(60) NOT NULL,
    cnpj_id UUID REFERENCES cnpj(id),
    org_unit_id UUID REFERENCES org_unit(id),
    token VARCHAR(100) NOT NULL UNIQUE,
    invited_by_user_id UUID NOT NULL REFERENCES user_account(id),
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    created_user_id UUID REFERENCES user_account(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ix_user_invitation_tenant ON user_invitation(tenant_id);
CREATE INDEX ix_user_invitation_email ON user_invitation(email);
CREATE INDEX ix_user_invitation_token ON user_invitation(token);
CREATE INDEX ix_user_invitation_status ON user_invitation(status);
```

### 9.3 Nova Tabela: auth_token

```sql
CREATE TABLE IF NOT EXISTS auth_token (
    id UUID PRIMARY KEY,
    token_type VARCHAR(30) NOT NULL,
    token_hash VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES user_account(id),
    employee_id UUID REFERENCES employee(id),
    email VARCHAR(200),
    phone VARCHAR(20),
    otp_code VARCHAR(6),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ix_auth_token_hash ON auth_token(token_hash);
CREATE INDEX ix_auth_token_user ON auth_token(user_id);
CREATE INDEX ix_auth_token_type ON auth_token(token_type);
```

### 9.4 Nova Tabela: auth_audit_log

```sql
CREATE TABLE IF NOT EXISTS auth_audit_log (
    id UUID PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES user_account(id),
    employee_id UUID REFERENCES employee(id),
    tenant_id UUID REFERENCES tenant(id),
    email VARCHAR(200),
    cpf VARCHAR(14),
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    location_country VARCHAR(2),
    location_city VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ix_auth_audit_user ON auth_audit_log(user_id);
CREATE INDEX ix_auth_audit_tenant ON auth_audit_log(tenant_id);
CREATE INDEX ix_auth_audit_event ON auth_audit_log(event_type);
CREATE INDEX ix_auth_audit_created ON auth_audit_log(created_at);
```

### 9.5 Atualização em employee

```sql
ALTER TABLE employee ADD COLUMN IF NOT EXISTS linked_user_id UUID REFERENCES user_account(id);
ALTER TABLE employee ADD COLUMN IF NOT EXISTS portal_access_enabled BOOLEAN DEFAULT false;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS portal_password_hash VARCHAR(500);
ALTER TABLE employee ADD COLUMN IF NOT EXISTS portal_must_change_password BOOLEAN DEFAULT true;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS portal_last_login_at TIMESTAMP;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS preferred_contact VARCHAR(20);

CREATE INDEX ix_employee_linked_user ON employee(linked_user_id);
```

### 9.6 Atualização em user_role_scope

```sql
ALTER TABLE user_role_scope ADD COLUMN IF NOT EXISTS granted_by_user_id UUID REFERENCES user_account(id);
ALTER TABLE user_role_scope ADD COLUMN IF NOT EXISTS granted_at TIMESTAMP DEFAULT NOW();
ALTER TABLE user_role_scope ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE user_role_scope ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
```

---

## 10. Checklist de Implementação

### Backend
- [ ] Migrações de banco (bootstrap_migrations.py)
- [ ] Modelo: UserInvitation
- [ ] Modelo: AuthToken  
- [ ] Modelo: AuthAuditLog
- [ ] Atualizar modelo: User (novos campos)
- [ ] Atualizar modelo: Employee (novos campos)
- [ ] Atualizar modelo: UserRoleScope (novos campos)
- [ ] API: /auth/* (login, logout, refresh, reset, OTP, magic link)
- [ ] API: /users/* (CRUD, roles, convites)
- [ ] API: /invitations/* (criar, validar, aceitar)
- [ ] Service: AuthService
- [ ] Service: InvitationService
- [ ] Service: OTPService (SMS)
- [ ] Service: MagicLinkService
- [ ] Middleware: rate limiting para auth
- [ ] Testes unitários
- [ ] Testes de integração

### Frontend
- [ ] Página: /login (email + CPF toggle)
- [ ] Página: /login/otp (verificação)
- [ ] Página: /auth/magic/{token}
- [ ] Página: /forgot-password
- [ ] Página: /reset-password/{token}
- [ ] Página: /invitation/{token} (aceitar convite)
- [ ] Página: /select-tenant (múltiplas empresas)
- [ ] Página: /settings/users (lista)
- [ ] Página: /settings/users/{id} (detalhes)
- [ ] Modal: Convidar usuário
- [ ] Modal: Editar usuário
- [ ] Modal: Gerenciar papéis
- [ ] Componente: UserPicker (seletor de usuário)
- [ ] Componente: RoleBadge
- [ ] Hook: useAuth
- [ ] Hook: useCurrentUser
- [ ] Context: AuthContext (atualizado)

---

## Anexo A: Matriz de Permissões

| Ação | OWNER | ADMIN | CNPJ_MGR | UNIT_MGR | SST | VIEWER |
|------|-------|-------|----------|----------|-----|--------|
| Ver usuários | ✅ | ✅ | ✅¹ | ✅¹ | ❌ | ❌ |
| Convidar usuário | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Editar usuário | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Remover usuário | ✅ | ✅² | ❌ | ❌ | ❌ | ❌ |
| Gerenciar papéis | ✅ | ✅² | ❌ | ❌ | ❌ | ❌ |
| Ver colaboradores | ✅ | ✅ | ✅¹ | ✅¹ | ✅ | ✅¹ |
| Criar colaborador | ✅ | ✅ | ✅¹ | ❌ | ❌ | ❌ |
| Editar colaborador | ✅ | ✅ | ✅¹ | ❌ | ❌ | ❌ |
| Ver campanhas | ✅ | ✅ | ✅¹ | ✅¹ | ✅ | ✅¹ |
| Criar campanha | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Ver plano ação | ✅ | ✅ | ✅¹ | ✅¹ | ✅ | ✅¹ |
| Criar plano ação | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Executar ação | ✅ | ✅ | ✅¹ | ✅¹ | ✅ | ❌ |
| Ver relatórios | ✅ | ✅ | ✅¹ | ✅¹ | ✅ | ✅¹ |
| Exportar eSocial | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Gerenciar plano | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cancelar conta | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

¹ Apenas no escopo atribuído (CNPJ ou Unidade)
² Não pode gerenciar OWNER

---

**FIM DO DOCUMENTO**
