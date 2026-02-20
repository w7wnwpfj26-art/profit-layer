-- 006: 添加 TOTP 二次验证字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.totp_secret IS 'Base32 编码的 TOTP 密钥 (Google Authenticator)';
COMMENT ON COLUMN users.totp_enabled IS '是否启用了 2FA';
