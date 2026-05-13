# DbGate Docker

DbGate runs as a Docker Compose service on host port `3008`, mapped to the
official container port `3000`.

The stack uses the official community image. Keep the image tag in `.env` so
upgrades are deliberate instead of automatically following `latest`.

## Start

For first setup, create `.env` from the example and edit the password:

```sh
cp .env.example .env
```

Then start DbGate:

```sh
docker compose up -d
```

Open http://localhost:3008

## Upgrade

Update `DBGATE_IMAGE` in `.env`, then recreate the service:

```sh
docker compose pull
docker compose up -d
```

The default example uses the smaller `dbgate/dbgate:7.1.11-alpine` image. Switch
to the full `dbgate/dbgate:7.1.11` image if you need SQLite support.

## Login

The community Docker image supports built-in web authentication with the `LOGIN` and `PASSWORD` environment variables. This stack reads them from `.env`.

```sh
DBGATE_IMAGE=dbgate/dbgate:7.1.11-alpine
DBGATE_LOGIN=admin
DBGATE_PASSWORD=change-this-password
```

Leave `DBGATE_BASIC_AUTH` empty for the default login form. Set it to `1` if you prefer HTTP Basic authentication.

## Stop

```sh
docker compose down
```
