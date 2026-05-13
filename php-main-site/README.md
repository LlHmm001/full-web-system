# php-main-site

主业务网站 —— 全国授课动态数据看板。

**技术栈**: PHP 8.4 + Apache + MySQL 8.0 + Docker Compose

## 目录结构

```
php-main-site/
├── Dockerfile              # PHP + Apache 镜像构建
├── docker-compose.yml      # 编排 app + mysql 服务
├── docker-entrypoint.sh    # 容器入口（替换数据库连接配置）
├── .env.example            # 环境变量模板
├── .env                    # 实际环境变量（不提交 Git）
├── .gitignore
├── .dockerignore
├── deploy.sh               # 一键部署脚本
├── README.md
├── mysql/
│   └── init/
│       └── 01-init.sql     # 首次启动自动初始化数据库
└── src/
    ├── index.php           # 主应用
    ├── index.css           # 样式
    ├── config/
    │   └── db_config.php   # 数据库配置（备用）
    └── font/               # OPPOSans 字体文件
```

## 首次部署

```bash
# 1. 进入项目目录
cd php-main-site

# 2. 创建环境配置
cp .env.example .env
# 编辑 .env，设置密码等参数

# 3. 部署
./deploy.sh
```

部署后访问: **http://localhost:3001/index.php**

## 更新部署

```bash
./deploy.sh
```

该脚本不会删除卷或数据库，可以安全反复执行。

## 查看日志

```bash
# 查看应用日志
docker compose logs -f app

# 查看 MySQL 日志
docker compose logs -f mysql

# 查看最近 200 行
docker compose logs --tail=200
```

## 停止服务

```bash
# 停止（保留数据）
docker compose stop

# 启动
docker compose start
```

**禁止使用 `docker compose down -v`**，这会删除数据库卷。

## 数据库备份

```bash
# 从 .env 读取密码
source .env
docker exec php_main_site_mysql mysqldump \
  -uroot -p${MYSQL_ROOT_PASSWORD} \
  --single-transaction --routines --triggers \
  mydb > backup_$(date +%Y%m%d_%H%M%S).sql
```

建议定期执行备份，可将此命令加入 crontab。

## 数据库恢复

```bash
source .env
docker exec -i php_main_site_mysql mysql \
  -uroot -p${MYSQL_ROOT_PASSWORD} \
  mydb < backup_20260513_120000.sql
```

恢复前请确认已停止写入操作。

## 其他项目如何连接此 MySQL

本项目 MySQL 加入了外部共享网络 `apps_shared_network`，其他 Docker 项目可通过以下方式连接：

**在 docker-compose.yml 中：**

```yaml
services:
  your-app:
    networks:
      - apps_shared_network
    environment:
      - DB_HOST=php_main_site_mysql   # 或 mysql（同 compose 内）
      - DB_PORT=3306
      - DB_DATABASE=mydb
      - DB_USERNAME=root
      - DB_PASSWORD=${MYSQL_ROOT_PASSWORD}

networks:
  apps_shared_network:
    external: true
    name: apps_shared_network
```

**非 Docker 直连（仅开发调试）：**

MySQL 端口未暴露到宿主机。如需外部工具连接，可临时暴露端口：

```bash
# 在 docker-compose.yml 的 mysql 服务中临时添加端口映射，然后重启
# ports:
#   - "127.0.0.1:3306:3306"
```

不建议长期暴露 3306 到公网。

## 重要警告

| ❌ 禁止操作 | ✅ 正确操作 |
|---|---|
| `docker compose down -v` | `docker compose stop` |
| `docker volume rm php_main_site_mysql_data` | 永远不删除此卷 |
| 直接 DELETE / DROP 数据库 | 先备份再操作 |
| 暴露 3306 到 0.0.0.0 | 仅内部网络通信 |
