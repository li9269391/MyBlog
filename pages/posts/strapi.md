---
title: 快速体验 Strapi CMS（基于 docker 部署）
date: 2023/2/6
description: 容器部署，快速体验 Strapi，它是一个开源的无头 CMS，它基于插件系统。
tag: strapi,docker
author: 后浪
---

**前言**

此文章是参考官方的方案，在使用的时候发现一些问题记录下来，供新手同学避坑。

[Strapi](https://docs.strapi.io/developer-docs/latest/getting-started/introduction.html) 是一个开源的无头 CMS，它基于插件系统，可以很方便扩展，具体请看官方介绍。 此文主要讲述如何快速体验它，无论是开发与生产，选择用 docker 容器部署，最大的好处是，不用在原机器系统安装各种环境，也不会因为项目环境导致与原系统服务版本冲突（即服务隔离），容器的好处想发大家都知道了，这里不展开。


**所部署的机器环境先决条件**
- 安装 [Node.js](https://nodejs.org/)（推荐使用 [nvm](https://github.com/nvm-sh/nvm) 安装与管理），查看 Strapi 受[支持的 Node.js 版本](https://docs.strapi.io/developer-docs/latest/setup-deployment-guides/installation/cli.html#step-1-make-sure-requirements-are-met)
- 安装 [Docker](https://www.docker.com/)
- 安装（可选，推荐）[Docker Compose](https://docs.docker.com/compose/)

## 1、使用 Strapi 官方 cli 脚手架创建项目

运行命令：`npx create-strapi-app@4.6.0 my-strapi-project`

> 想体验最新版本，把命令中的 @4.6.0 去掉即可\
> 提示：先确保已安装 node.js，再运行 npx 命令

## 2、创建生产版本的 dockerfile 文件

> 涉及切换阿里源很重要 `sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories`\
> 因为默认的 apk add 源是在国外服务器，如你的机器没有代理，在国内很慢导致超时失败，这也是官方教程卡住新手的一个致命原因。另外，单个 dokcerfile 中引用多个  FROM 基础镜像时要设置源多次
```bash
# path: ./Dockerfile.prod

FROM node:16-alpine as build
# Installing libvips-dev for sharp Compatibility
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && apk update && apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev vips-dev > /dev/null 2>&1
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
WORKDIR /opt/
COPY ./package.json ./package-lock.json ./
ENV PATH /opt/node_modules/.bin:$PATH
RUN npm install --production
WORKDIR /opt/app
COPY ./ .
RUN npm run build

FROM node:16-alpine
# Installing libvips-dev for sharp Compatibility
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && apk update && apk add vips-dev
RUN rm -rf /var/cache/apk/*
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
WORKDIR /opt/app
COPY --from=build /opt/node_modules ./node_modules
ENV PATH /opt/node_modules/.bin:$PATH
COPY --from=build /opt/app ./
EXPOSE 1337
CMD ["npm", "run","start"]

```

创建 .dockerignore 文件，用来在 build 的时候排除一些多余的大文件 copy 到镜像系统中，加快构建速度与减少镜像体积

```bash
# path: ./.dockerignore

node_modules
dist
build
```

## 3、根据 dockerfile，打包构建 docker 系统镜像

运行命令：`docker build --build-arg NODE_ENV=production -t strapiapp:latest -f Dockerfile.prod .`

> 参数说明： \
>--build-arg 打包时的环境变量设置 \
>-t 定义镜像名及版本 \
>-f 文件位置，如果名为 Dockerfile 可忽略不写
> 
构建成功，运行命令 `docker images` 查看本地镜像信息

## 4、创建 docker-compose.yml 文件

> 使用 docker-compose.ym 好处是，方便快速管理（启动及停止）项目服务，包括用于启动数据库容器（本文选择 mysql 数据库演示）\
> 相比直接运行 `docker run` 镜像时，后面要写一堆的参数。\
> 有关运行 Docker compose 及其命令的更多信息，请参阅 [Docker Compose 文档](https://docs.docker.com/compose/)

```bash

# path: ./docker-compose.yml

version: '3'
services:
  strapi:
    container_name: strapi
    build:
      context: ./
      dockerfile: Dockerfile.prod
    image: strapiapp:latest # 上一步对应的镜像名及版本，本地没有会取远程
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_CLIENT: ${DATABASE_CLIENT}
      DATABASE_HOST: strapiDB # 同个机器的数据服务，自动选当前内网IP
      DATABASE_PORT: ${DATABASE_PORT}
      DATABASE_NAME: ${DATABASE_NAME}
      DATABASE_USERNAME: ${DATABASE_USERNAME}
      DATABASE_PASSWORD: ${DATABASE_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET}
      APP_KEYS: ${APP_KEYS}
      NODE_ENV: ${NODE_ENV}
    volumes:
      - ./config:/opt/app/config
      #- ./src:/opt/app/src # 项目采有 ts，要打包编译后才能使用，所以无需映射此目录
      - ./package.json:/opt/app/package.json
      - ./package-lock.json:/opt/app/package-lock.json
      - ./.env:/opt/app/.env
      - ./public/uploads:/opt/app/public/uploads
    ports:
      - '1337:1337'
    networks:
      - strapi
    depends_on:
      - strapiDB
  
  strapiDB:
    container_name: strapiDB
    platform: linux/amd64 #for platform error on Apple M1 chips
    restart: unless-stopped
    env_file: .env
    image: mysql:5.7 # strapi 项目依懒的 mysql 包，暂不支持高版本的 mysql8
    command: --default-authentication-plugin=mysql_native_password
    environment:
      MYSQL_USER: ${DATABASE_USERNAME}
      MYSQL_ROOT_PASSWORD: ${DATABASE_PASSWORD}
      MYSQL_PASSWORD: ${DATABASE_PASSWORD}
      MYSQL_DATABASE: ${DATABASE_NAME}
    volumes:
      - strapi-data:/var/lib/mysql # 默认路径指向主机的 /var/lib/docker/volumes/
      #- ./data:/var/lib/mysql
    ports:
      - '3306:3306'
    networks:
      - strapi

volumes:
  strapi-data:

networks:
  strapi:
    name: Strapi
    driver: bridge
    
```

## 5、编辑 .env 文件，配置使用到的环境变量

项目 .gitignore 已忽略 .env 文件，当 git 提交项目后，需要在部署机器创建 .env 文件或设置环境变量（如 \~/.bash_profile、\~/.zshrc、\~/.profile 或 \~/.bashrc），因为变量涉及数据库的用户及密码，通常由 DB 运维人员管理分配，本地开发不允许连接生产数据库

参考示例：

```bash

APP_KEYS=leu+LeJZr5MueotcWIalKQ==,LekHoo565qnz9cNg8QnUnw==,uXWIERdMDEbsGvWLaL5RlA==,w2GXZx01hx6PGBkENrKstw==
API_TOKEN_SALT=eMHMayDIGVKmJQRkktXPdw==
JWT_SECRET=aAciVzAdiGYPa1Z4wMwEqw==
ADMIN_JWT_SECRET=gpaiVzAdiGYPa1Z4wMwEqw==
DATABASE_CLIENT=mysql
DATABASE_HOST=0.0.0.0
DATABASE_PORT=3306
DATABASE_NAME=strapi
DATABASE_USERNAME=root
DATABASE_PASSWORD=Strapi123
NODE_ENV=production

```

## 6、容器启动

运行命令 `docker-compose up -d`
> -d 参数表示后台运行，通常调试的时候先不加上，可以看到容器报错信息\
> 命令 `docker-compose down` 则是停止容器运行

## 7、创建初始数据库

数据容器运行，并不会自动帮你创建数据库，首次需要自己连接数据库，创建以配置的环境变量 `${DATABASE_NAME}` 名，对应的数据库

## 8、一切就绪

访问 http://your_IP:1337/admin 进行注册平台超级管理员账号，创建完成务必记住它！

然后你可以愉快的玩爽 Strapi 了，如替换后台语言为中文~
