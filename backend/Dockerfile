FROM node:24-slim
# docker CLI: the backend starts compute containers through the mounted docker.sock
# chromium: puppeteer renders the PDF report
RUN apt-get update && apt-get install -y --no-install-recommends docker.io chromium && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY desktop/package.json desktop/
RUN npm ci --workspace backend --include-workspace-root --ignore-scripts
COPY backend backend
CMD ["npm", "run", "start", "--workspace", "backend"]
