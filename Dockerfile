FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json server.mjs rating.mjs rewards.mjs web-auth.mjs ./
COPY public ./public
EXPOSE 3000
CMD ["node", "server.mjs"]
