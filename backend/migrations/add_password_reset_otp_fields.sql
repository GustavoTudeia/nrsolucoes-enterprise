-- Migração: Adicionar campos para recuperação de senha, OTP e magic link
-- Executar: docker compose exec db psql -U nr -d nrsolucoes -f /caminho/para/este/arquivo.sql

-- Campos para reset de senha
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(100);
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;

-- Campos para OTP
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10);
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS otp_expires TIMESTAMP;

-- Campos para magic link
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS magic_link_token VARCHAR(100);
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS magic_link_expires TIMESTAMP;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_password_reset_token ON user_account(password_reset_token) WHERE password_reset_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_magic_link_token ON user_account(magic_link_token) WHERE magic_link_token IS NOT NULL;
