# SSH 连接被关闭：服务器端修复步骤

当本机出现 `Connection closed by 8.145.51.48 port 22` 或 `kex_exchange_identification: Connection closed by remote host` 时，多为**服务器端**策略或配置导致在密钥交换前就断开连接。按下面步骤在服务器上逐项检查并修复后，再从本机用 SSH 重试。

**说明**：以下命令需在服务器上执行。因当前 SSH 不可用，请通过 **阿里云控制台 → 实例 → 远程连接 → Workbench 一键连接** 登录后，在终端中执行。修复完成后，本机 SSH 即可恢复。

---

## 1. 检查并修复 TCP Wrapper（hosts.allow / hosts.deny）

若 `hosts.deny` 拒绝了 sshd 且 `hosts.allow` 未放行，连接会在认证前被关掉。

```bash
# 查看当前配置
cat /etc/hosts.allow
cat /etc/hosts.deny
```

**修复**：确保 sshd 被允许（二选一）。

- 方式 A：允许所有 IP 连 sshd（临时排查用）
  ```bash
  echo 'sshd: ALL' | sudo tee -a /etc/hosts.allow
  ```
- 方式 B：只允许本机 IP（推荐，将 43.162.248.155 换成你本机公网 IP）
  ```bash
  echo 'sshd: 43.162.248.155' | sudo tee -a /etc/hosts.allow
  echo 'sshd: ALL' | sudo tee /etc/hosts.deny
  ```

若 `hosts.deny` 中存在 `ALL: ALL` 或 `sshd: ALL`，且没有在 `hosts.allow` 中放行你的 IP 或 sshd，需先修正为上面之一再继续。

---

## 2. 提高 sshd 的 MaxStartups（避免未认证连接被丢弃）

并发未认证连接过多时，sshd 会主动断开，表现为 `kex_exchange_identification` 被关闭。

```bash
# 查看当前值
sudo grep -i maxstartups /etc/ssh/sshd_config

# 若无配置或数值偏小，追加并设为更大（例如 100）
echo 'MaxStartups 100:30:200' | sudo tee -a /etc/ssh/sshd_config
```

---

## 3. 确认 sshd 配置无语法错误

```bash
sudo sshd -t
```

若有报错，根据提示修改 `/etc/ssh/sshd_config`（例如 `sudo vi /etc/ssh/sshd_config`），保存后再执行一次 `sudo sshd -t` 直到无输出。

---

## 4. 确认 SSH 主机密钥存在（部分系统缺失会导致异常）

```bash
ls -la /etc/ssh/ssh_host_*
```

至少应有 `ssh_host_rsa_key`、`ssh_host_ecdsa_key` 或 `ssh_host_ed25519_key`。若缺失，可生成（以 ed25519 为例）：

```bash
sudo ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ''
sudo chmod 600 /etc/ssh/ssh_host_ed25519_key
sudo chmod 644 /etc/ssh/ssh_host_ed25519_key.pub
```

---

## 5. 重启 sshd 使配置生效

```bash
sudo systemctl restart sshd
# 或
sudo service sshd restart
```

---

## 6. 确认 22 端口在监听

```bash
sudo ss -tlnp | grep :22
```

应看到 `sshd` 监听 `0.0.0.0:22` 或 `:::22`。

---

## 7. 本机再次测试 SSH

在**本机**终端执行（密钥路径按你本机实际修改）：

```bash
ssh -o ConnectTimeout=15 -i "/Users/seanlee/Desktop/00-Cursor与AI工具/密钥与部署/部署0228SSH.pem" admin@8.145.51.48 "echo OK"
```

若仍失败，可在服务器上查看 sshd 日志以确认拒绝原因：

```bash
sudo journalctl -u sshd -n 50 --no-pager
# 或
sudo tail -50 /var/log/secure
```

---

## 参考来源

- 阿里云 ECS：SSH exchange identification / Connection reset by peer 排查与修复  
- ServerFault: kex_exchange_identification Connection closed by remote host（MaxStartups、TCP Wrappers）  
- 简书 / 阿里云社区：hosts.allow、hosts.deny 与 sshd 访问控制
