FROM php:8.4-apache

# Use Aliyun Debian mirror for faster apt in China
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    echo "deb http://mirrors.aliyun.com/debian bookworm main contrib non-free" > /etc/apt/sources.list.d/mirror.list 2>/dev/null; \
    true

# 安装 PHP 扩展
RUN docker-php-ext-install pdo_mysql && \
    docker-php-ext-enable pdo_mysql

# 启用 Apache mod_rewrite
RUN a2enmod rewrite

# 配置 Apache
RUN echo '<Directory /var/www/html>\n\
    Options Indexes FollowSymLinks\n\
    AllowOverride All\n\
    Require all granted\n\
</Directory>' > /etc/apache2/conf-available/php-main-site.conf && \
    a2enconf php-main-site

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 复制源码
COPY src/ /var/www/html/
RUN chmod -R 755 /var/www/html

# 复制并配置入口脚本
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /var/www/html
EXPOSE 80

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["apache2-foreground"]
