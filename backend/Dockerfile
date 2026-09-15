# Imagem única, com dependências de desenvolvimento incluídas.
#
# Um build multi-estágio produziria imagem menor, mas o seed roda via ts-node e a
# avaliação depende de `docker compose up` funcionar de primeira. Para produção, o
# caminho seria compilar o seed e descartar as dependências de desenvolvimento.
FROM node:22-alpine

WORKDIR /app

# Os engines do Prisma são binários nativos e, no Alpine, dependem do OpenSSL e da
# camada de compatibilidade com a glibc. Sem eles o cliente gera mas não conecta.
RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate && npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main"]
