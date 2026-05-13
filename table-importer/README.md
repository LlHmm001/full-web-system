# table-importer

表格数据处理和上传工具。它是一个 Node.js / Next.js 应用，用于上传 `.xlsx`、编辑和运行 JS 宏、下载处理后的表格，并把处理后的数据覆盖写入 `php-main-site` 项目的 MySQL。

## 重要风险

这个工具可能执行批量数据替换、列删除、列插入和覆盖入库。执行任何会影响 `php_main_site_mysql` 的操作前，必须先备份主站数据库。

禁止操作：

- 不要执行 `docker compose down -v`
- 不要删除 `php_main_site_mysql_data`
- 不要清空主站数据库
- 不要在未确认备份的情况下执行覆盖入库或危险替换
- 不要把真实 `.env`、上传原始表格、处理后敏感表格提交到 Git

本项目不会自动执行危险数据替换。宏运行、下载和覆盖入库都需要你在 Web 页面中明确点击。

## 技术栈分析

- 项目类型：Node.js / Next.js / TypeScript
- 前端：React、Tailwind CSS、Monaco Editor
- Excel：ExcelJS
- 宏沙箱：quickjs-emscripten，不使用 `eval` / `new Function`
- 数据库客户端：mysql2，保留 pg 依赖用于兼容 PostgreSQL 选项
- 本地持久化：`.data/`

## 命令与端口

依赖安装：

```bash
npm install
```

构建：

```bash
npm run build
```

本地启动：

```bash
npm run dev
```

生产启动：

```bash
npm run start
```

端口：

- 容器内端口：`3003`
- 宿主机端口：`3003`
- 可通过 `.env` 的 `APP_HOST_PORT` 和 `APP_CONTAINER_PORT` 调整

## 目录结构

建议服务器部署目录名：

```text
table-importer/
├── Dockerfile
├── docker-compose.yml
├── .env
├── .env.example
├── .gitignore
├── .dockerignore
├── deploy.sh
└── README.md
```

当前应用代码还包含：

```text
app/
components/
lib/
scripts/
package.json
package-lock.json
```

`.data/` 是运行时持久化目录，用来保存：

- 已创建和排序好的 JS 宏：`.data/macros.json`
- 上传的原始表格：`.data/workbooks/*.original.xlsx`
- 处理后的表格：`.data/workbooks/*.processed.xlsx`

这些文件可能包含敏感数据，已被 `.gitignore` 和 `.dockerignore` 排除。

## 环境变量

复制示例文件：

```bash
cp .env.example .env
```

默认连接主站 MySQL：

```env
APP_HOST_PORT=3003
APP_CONTAINER_PORT=3003

DB_HOST=php_main_site_mysql
DB_PORT=3306
DB_NAME=main_site_db
DB_USER=main_site_user
DB_PASSWORD=change_me

MYSQL_DATABASE_URL=
```

如果设置了 `MYSQL_DATABASE_URL`，会优先使用它；否则会用 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD` 拼接连接。

## Docker 网络

本项目会加入两个网络：

- `table_importer_network`：本项目自己的应用网络
- `apps_shared_network`：外部共享网络，用来访问 `php_main_site_mysql`

`php_main_site_mysql` 必须已经在 `apps_shared_network` 中，并能通过容器名解析。

可以检查：

```bash
docker network inspect apps_shared_network
docker inspect php_main_site_mysql
```

## 部署

首次部署：

```bash
chmod +x deploy.sh
./deploy.sh
```

手动部署：

```bash
mkdir -p .data/workbooks logs
docker compose up -d --build
```

查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f app
```

更新部署：

```bash
git pull
npm install
npm run build
docker compose up -d --build
```

不要使用 `docker compose down -v`。如果需要停止应用，只停止 app：

```bash
docker compose stop app
```

## 使用流程

1. 打开 `http://localhost:3003`
2. 上传 `.xlsx`
3. 新增、排序或编辑宏
4. 可点击「转译」把常见 WPS/Excel 写法转成兼容写法
5. 点击「运行宏」或「运行全部宏」
6. 检查预览数据，也可以直接编辑预览单元格
7. 下载处理后的 Excel
8. 如果要入库，先备份 `php_main_site_mysql`
9. 选择 MySQL，确认表名和表头，再点击「覆盖入库」

## 宏兼容与转译

保存宏和运行宏前会自动做轻量转译。当前支持：

- `Application.ActiveSheet` -> `ActiveSheet`
- `ActiveWorkbook.ActiveSheet` -> `ActiveSheet`
- 裸 `Cells(...)` / `Rows(...)` / `Columns(...)` -> `ActiveSheet.Cells(...)` / `ActiveSheet.Rows(...)` / `ActiveSheet.Columns(...)`
- `.Value` -> `.Value2`
- `Application.Range(...)` -> `Range(...)`

当前兼容层支持：

- `ActiveSheet.Cells(row, col).Value2`
- `ActiveSheet.Cells(row, col).Text`
- `ActiveSheet.Cells(row, col).HasFormula`
- `ActiveSheet.UsedRange.Rows.Count`
- `ActiveSheet.UsedRange.Columns.Count`
- `ActiveSheet.Columns(n).Insert()` / `Delete()`
- `ActiveSheet.Rows(n).Insert()` / `Delete()`
- `Range("A1:B2")`
- `sheet.Range(sheet.Cells(...), sheet.Cells(...))`
- `console.log(...)`

## MySQL 入库说明

目标表必须提前在 `php-main-site` 的 MySQL 中创建好。字段名必须与 Excel 表头一致，只允许字母、数字、下划线，并且不能以数字开头。

示例：

```sql
CREATE TABLE brand_terms_import (
  name text,
  lname text,
  citi text,
  Industry text,
  subject text,
  subject2 text,
  Remarks text
);
```

MySQL 的 `TRUNCATE` 会隐式提交事务，因此本工具的 MySQL `overwrite` 使用事务内：

1. `START TRANSACTION`
2. `DELETE FROM \`目标表\``
3. 分批 `INSERT`
4. `COMMIT`

失败时会 `ROLLBACK`。执行前仍必须先备份，因为覆盖写入会删除目标表已有数据。

## API

- `POST /api/workbook/upload`
- `GET /api/macros`
- `POST /api/macros`
- `PUT /api/macros/:id`
- `DELETE /api/macros/:id`
- `POST /api/macros/translate`
- `PUT /api/macros/reorder`
- `POST /api/workbook/:id/run-macro`
- `POST /api/workbook/:id/run-all-macros`
- `PATCH /api/workbook/:id/cell`
- `GET /api/workbook/:id/download`
- `POST /api/workbook/:id/import-db`
