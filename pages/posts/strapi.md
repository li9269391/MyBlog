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

## 一、创建项目

使用 Strapi 官方 cli 脚手架创建，根据提示输入即可，演示选择的数据库 client 为 mysql

运行命令：`npx create-strapi-app@4.6.0 my-strapi-project`

> 想体验最新版本，把命令中的 @4.6.0 去掉即可\
> 提示：先确保已安装 node.js，再运行 npx 命令


![创建项目.png](/images/npx-create.png)

创建完成，关于数据库部分的配置，还可以在 ./config/database.ts 和环境变量中进行修改

## 二、创建 dockerfile 文件

> apk add 时切换阿里源很重要 `sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories`\
> 因为默认的 apk add 源是在国外服务器，如你的机器没有代理，在国内很慢导致超时失败，这也是官方教程卡住新手的一个致命原因。另外，单个 dokcerfile 中引用多个 FROM 基础镜像时（多阶段构建），要设置源多次。

- 本地开发用到的：

```bash
# path: ./Dockerfile

FROM node:16-alpine
# Installing libvips-dev for sharp Compatibility
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && apk update && apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev nasm bash vips-dev
ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}
WORKDIR /opt/
COPY ./package.json ./package-lock.json ./
ENV PATH /opt/node_modules/.bin:$PATH
RUN npm install
WORKDIR /opt/app
COPY ./ .
RUN npm run build
EXPOSE 1337
# 启动开发模式
CMD ["npm", "run", "develop"]

```
> 提醒：[Strapi 规定了定义数据模型（API, Content-Type Builder）方式](https://docs.strapi.io/developer-docs/latest/getting-started/troubleshooting.html#why-can-t-i-create-or-update-content-types-in-production-staging)，只允许在访问开发模式（npm run develop）下进行，创建的模型配置会存储在 ./src/api/ 目录，开发完成，部署生产时需要重新构建镜像。


- 生产环境用到的：

```bash
# path: ./Dockerfile.prod 生产环境

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

另外再创建 .dockerignore 文件，用来在 build 的时候排除一些多余的大文件 copy 到镜像系统中，加快构建速度与减少镜像体积

```bash
# path: ./.dockerignore

node_modules
dist
build
```

## 三、构建 docker 镜像

> 为了加速 docker 镜像构建，推荐 docker 国内源设置，[参考](https://blog.51cto.com/echohye/5605743)

构建本地开发模式镜像，在项目根目录，运行：\
`docker build -t strapiapp:dev .`

构建生产模式镜像，运行：\
`docker build --build-arg NODE_ENV=production -t strapiapp:latest -f Dockerfile.prod .`

> 参数说明： \
>--build-arg 打包时的环境变量设置 \
>-t 定义镜像名及版本 \
>-f 文件位置，如果名为 Dockerfile 可忽略不写\
>. 末尾小数点为路径，不可缺少

构建成功，运行命令 `docker images` 查看镜像信息

## 四、创建 docker-compose.yml 文件

> compose 负责实现对 Docker 容器集群的快速编排。相比使用 `docker run` 运行方便太多了

```bash

# path: ./docker-compose.yml

version: '3'
services:
  strapi:
    container_name: strapi
    image: strapiapp:dev # 镜像，生产环境则为 strapiapp:latest 
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_CLIENT: ${DATABASE_CLIENT}
      DATABASE_HOST: strapiDB # 容器互联。如果云服务器内网 IP 变更导致连接不上，改用固定 IP
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
      - ./src:/opt/app/src # 创建的内容类型会存放在 src/api
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
      - strapi-data:/var/lib/mysql # 挂载数据卷
      #- ./data:/var/lib/mysql
    ports:
      - '3306:3306'
    networks:
      - strapi

volumes:
  strapi-data: # 创建数据卷，数据持久化在主机，即使删除容器也不受影响

networks:
  strapi:
    name: Strapi
    driver: bridge
    
```

如果数据库在其它机器，提前创建好用户与数据库，就不需要数据服务容器，去掉即可，如下：

```bash

# path: ./docker-compose.yml

version: '3'
services:
  strapi:
    container_name: strapi
    build:
      context: ./
      dockerfile: Dockerfile # 如果 image 不存在，构建一个新镜像并使用
    image: strapiapp:dev     # 开发镜像
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_CLIENT: ${DATABASE_CLIENT}
      DATABASE_HOST: ${DATABASE_HOST}
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
      - ./src:/opt/app/src # 创建的内容类型会存放在 src/api
      - ./package.json:/opt/app/package.json
      - ./package-lock.json:/opt/app/package-lock.json
      - ./.env:/opt/app/.env
      - ./public/uploads:/opt/app/public/uploads
    ports:
      - '1337:1337'

```


## 五、设置项目环境变量

编辑 .env 文件，配置使用到的[环境变量](https://docs.strapi.io/developer-docs/latest/setup-deployment-guides/installation/docker.html#development-and-or-staging-environments)

> 注意：项目 .gitignore 已忽略 .env 文件，当 git 提交项目后，需要在部署机器创建 .env 文件或设置环境变量（如 \~/.bash_profile、\~/.zshrc、\~/.profile 或 \~/.bashrc），因为本地开发数据库与生产环境不同，通常由 DB 运维人员管理分配

示例：

```bash
# path ./.env

APP_KEYS=leu+LeJZr5MueotcWIalKQ==,LekHoo565qnz9cNg8QnUnw==,uXWIERdMDEbsGvWLaL5RlA==,w2GXZx01hx6PGBkENrKstw==
API_TOKEN_SALT=eMHMayDIGVKmJQRkktXPdw==
JWT_SECRET=aAciVzAdiGYPa1Z4wMwEqw==
ADMIN_JWT_SECRET=gpaiVzAdiGYPa1Z4wMwEqw==
DATABASE_CLIENT=mysql
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=strapidev
DATABASE_USERNAME=strapidev
DATABASE_PASSWORD=strapidev
NODE_ENV=development

```

## 六、容器启动

启动 `docker-compose up -d`\
停止 `docker-compose down`

> -d 参数表示后台运行，通常调试的时候先不加上，可以看到容器报错信息\
> -f 指定配置文件，如：`docker-compose -f docker-compose.prod.yml up -d`\
> 有关运行 Docker compose 及其命令的更多信息，请参阅 [Docker Compose 文档](https://docs.docker.com/compose/)
>

## 七、一切就绪

访问 http://your_IP:1337/admin 进行注册平台超级管理员账号，创建完成务必记住它！

然后你可以愉快的玩爽 Strapi 了，如[设置 admin 后台语言环境](https://docs.strapi.io/developer-docs/latest/development/admin-customization.html#configuration-options)为中文~