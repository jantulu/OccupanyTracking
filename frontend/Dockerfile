FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy Tailwind and PostCSS configs
COPY tailwind.config.js postcss.config.js ./

# Copy source code
COPY public ./public
COPY src ./src

# Build the app (Tailwind will compile during this step)
RUN npm run build

# Production stage
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
