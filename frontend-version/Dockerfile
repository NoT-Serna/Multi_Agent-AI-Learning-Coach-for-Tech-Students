# Etapa 1: Compilar el código (Builder)
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Le decimos a React dónde buscar al backend
ENV VITE_API_URL=http://localhost:8006
RUN npm run build

# Etapa 2: Servidor Ligero (Nginx)
FROM nginx:alpine
# Copiamos la compilación de la Etapa 1
COPY --from=builder /app/dist /usr/share/nginx/html
# Copiamos las reglas que creaste en el paso anterior
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]