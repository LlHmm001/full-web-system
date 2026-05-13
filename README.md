# Full Web System

This repository contains the complete system:

- **php-main-site**: PHP main website and MySQL owner
- **dbgate**: Web database management tool
- **table-importer**: Spreadsheet processing and database import tool

## Directory Structure

```
.
├── php-main-site/
├── dbgate/
├── table-importer/
├── deploy-all.sh
└── README.md
```

## Shared Docker Network

All services use:

```
apps_shared_network
```

Create it manually if needed:

```bash
docker network create apps_shared_network
```

The deploy script will also create it automatically if it does not exist.

## MySQL Ownership

MySQL belongs to `php-main-site`.

```
MySQL container: php_main_site_mysql
MySQL volume: php_main_site_mysql_data
Internal host: php_main_site_mysql
Port: 3306
```

## DbGate Connection

Inside DbGate, connect to MySQL with:

```
Host: php_main_site_mysql
Port: 3306
Database: see php-main-site/.env
User: see php-main-site/.env
Password: see php-main-site/.env
```

## Table Importer Database Connection

In `table-importer/.env`, use:

```env
DB_HOST=php_main_site_mysql
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
```

## Deploy All

```bash
cd /opt/apps
./deploy-all.sh
```

## Deploy Individual Module

```bash
cd /opt/apps/php-main-site
./deploy.sh
```

```bash
cd /opt/apps/dbgate
./deploy.sh
```

```bash
cd /opt/apps/table-importer
./deploy.sh
```

## Important Warnings

Do not commit `.env` files.

Do not run:

```bash
docker compose down -v
```

Do not delete:

```
php_main_site_mysql_data
```

Always back up MySQL before running table-importer data replacement.
