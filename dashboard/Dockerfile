# Build stage
FROM node:20 AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

ENV CI=true

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy the rest of the application
COPY . .

# Build args for Vite env variables (injected at build time)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ARG VITE_ADMIN_USERNAME
ARG VITE_ADMIN_PASSWORD
ARG VITE_GUEST_USERNAME
ARG VITE_GUEST_PASSWORD
ENV VITE_ADMIN_USERNAME=$VITE_ADMIN_USERNAME
ENV VITE_ADMIN_PASSWORD=$VITE_ADMIN_PASSWORD
ENV VITE_GUEST_USERNAME=$VITE_GUEST_USERNAME
ENV VITE_GUEST_PASSWORD=$VITE_GUEST_PASSWORD
ARG VITE_OPENAI_API_KEY
ARG VITE_OPENAI_MODEL
ARG VITE_OPENAI_BASE_URL
ARG VITE_SERPER_API_KEY
ENV VITE_OPENAI_API_KEY=$VITE_OPENAI_API_KEY
ENV VITE_OPENAI_MODEL=$VITE_OPENAI_MODEL
ENV VITE_OPENAI_BASE_URL=$VITE_OPENAI_BASE_URL
ENV VITE_SERPER_API_KEY=$VITE_SERPER_API_KEY

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Replace default Nginx config with our own for SPA routing and listening on 8080
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]