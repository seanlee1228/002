# SSH 部署故障排查手册

目标：恢复 `expect deploy.sh` 一键部署能力，让 Cursor 通过 SSH 从本机直接部署到服务器。

---

## 一、本机先做：获取详细连接日志

在你的 Mac 终端执行（会输出很多调试信息）：

```bash
ssh -vvv admin@8.145.51.48 2>&1 | tee /tmp/ssh-debug.log
```

连接断开后，把 `/tmp/ssh-debug.log` 的**最后 50 行**发给我，便于精确定位断开阶段（KEX/认证等）。

---

## 二、服务器端（通过 Workbench）逐项检查

在阿里云控制台 Web 终端用 `admin` 登录后，依次执行以下命令。

### 1. TCP Wrappers（hosts.allow/deny）

```bash
cat /etc/hosts.allow 2>/dev/null || echo "文件不存在"
cat /etc/hosts.deny 2>/dev/null || echo "文件不存在"
```

若 `hosts.deny` 中有 `sshd: ALL` 或类似规则，会拦截公网 SSH。

### 2. fail2ban 是否在运行

```bash
sudo systemctl status fail2ban 2>/dev/null || sudo systemctl status fail2ban-client 2>/dev/null || echo "未安装 fail2ban"
```

若 fail2ban 在跑，可能已封禁你本机 IP，可临时停止测试：
`sudo systemctl stop fail2ban`

### 3. sshd 当前 Ciphers/KEX 配置

```bash
ps aux | grep sshd
```

看启动参数里的 `-oCiphers=` 和 `-oMACs=`，确认服务器支持的算法；若过严，可能和 macOS 自带 OpenSSH 不兼容。

### 4. 放宽 sshd 算法（临时测试）

备份并编辑配置：

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
sudo nano /etc/ssh/sshd_config
```

在文件末尾追加（若已有同类配置则注释掉原有一行，保留其一）：

```
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group14-sha256,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
Ciphers aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes128-ctr
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,hmac-sha2-256,hmac-sha2-512
```

保存后重载：`sudo systemctl reload sshd`

再从本机执行 `ssh admin@8.145.51.48` 测试。

### 5. 确认密钥权限

```bash
ls -la ~/.ssh/
cat ~/.ssh/authorized_keys | tail -1
```

确认 `authorized_keys` 中有你的公钥，且权限为 600。

---

## 三、deploy.sh 前提条件

SSH 能从本机成功登录后，`expect deploy.sh` 才能工作。当前脚本使用：

- 用户：`root`（需 root 密码）
- 方式：expect 自动输入密码

若你改为用 `admin` + 公钥登录，需修改 `deploy.sh`：
- 把 `USER` 改为 `admin`
- 去掉密码逻辑，改用 SSH 密钥（`ssh -i ~/.ssh/id_ed25519`）

---

## 四、恢复后的部署命令

```bash
cd "/Users/seanlee/Desktop/00-Cursor与AI工具/开发项目/class-routine-score-system"
expect deploy.sh
```
