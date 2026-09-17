FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

# Vai em /etc/nginx/templates/ (não direto em conf.d/) de propósito: é o
# diretório que o entrypoint oficial da imagem varre e roda `envsubst` antes
# de subir, gravando o resultado em conf.d/default.conf. Os dois valores que
# variam (endereço da API e porta em que o nginx escuta) vêm do ambiente — ver
# o comentário no próprio template e docker-compose.rede-host.yml.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 80
