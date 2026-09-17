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

# --ignore-scripts é necessário aqui: o `postinstall` do package.json roda `prisma
# generate`, e nesta camada só package*.json foi copiado ainda — prisma/schema.prisma
# só chega no COPY . . de baixo. Sem isso o build quebra com "Could not find Prisma
# Schema" bem no meio do npm ci. O generate de verdade continua na linha de baixo,
# que já roda depois do COPY . ., quando o schema existe.
COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

RUN npx prisma generate && npm run build

# O bit de execução é definido aqui, e não confiado ao checkout: o Git preserva
# a permissão, mas o arquivo pode chegar por zip, por Windows ou por um volume
# montado, e aí `permission denied` no start seria o sintoma.
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

# A inicialização mora no script porque precisa esperar o banco e decidir o que
# fazer quando o seed falha — lógica que não cabe numa linha encadeada com `&&`.
CMD ["./docker-entrypoint.sh"]
