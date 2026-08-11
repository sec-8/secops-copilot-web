# 阶段 1：构建
FROM node:20-alpine AS builder

# 设置生产模式，减少输出体积（如 React/Vite 会优化）
ENV NODE_ENV=production

WORKDIR /app
COPY package*.json ./
# 根据 lock 文件精确安装
RUN npm ci --ignore-scripts

# 复制所有源码
COPY . .

RUN npm run build    # tsc -b && vite build

# 阶段 2：导出（不做 serve，由前端 dev 跑 npm run preview）
# 你可以只输出 dist 目录，不写 nginx 阶段
FROM scratch AS exporter
COPY --from=builder /app/dist /dist
# 这个阶段不跑，只为导出产物到主机
# 实际演示：docker build -t secops-web-builder ...
#           docker create --name extract secops-web-builder
#           docker cp extract:/dist ./web-dist
#           docker rm extract
# 然后：cd web-dist && python -m http.server 5173