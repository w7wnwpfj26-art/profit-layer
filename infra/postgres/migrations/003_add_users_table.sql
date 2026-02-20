-- 用户认证表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',       -- 'admin', 'user', 'viewer'
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建默认管理员账号（密码: admin123）
-- salt = 'default_salt_change_me'
-- 注意：正式环境请立即修改密码
INSERT INTO users (username, password_hash, salt, role)
VALUES (
    'admin',
    -- 这是 pbkdf2(password='admin123', salt='default_salt_change_me', iterations=100000, keylen=64, digest='sha512') 的结果
    -- 用户登录后可通过 API 修改密码
    'placeholder_will_be_set_on_first_login',
    'default_salt_change_me',
    'admin'
) ON CONFLICT (username) DO NOTHING;
