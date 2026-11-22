# 一个容器同时提供：家庭同步 API + App 页面
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/travel.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./
# SQLite 数据文件放在 /data，部署时挂载持久化磁盘
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "--disable-warning=ExperimentalWarning", "dist-server/index.js"]
