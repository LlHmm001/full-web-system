#!/bin/bash
# Docker entrypoint — PHP 从环境变量读取配置，无需 sed 替换源码
set -e
exec "$@"
