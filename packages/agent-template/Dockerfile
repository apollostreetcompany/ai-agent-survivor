FROM node:22-slim

# Install Python for code execution tasks
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb* ./
RUN npm install --production

# Copy source
COPY dist/ ./dist/

# Create workspace and data directories
RUN mkdir -p /app/workspace /app/data && \
    chown -R 1000:1000 /app/workspace /app/data

# Run as non-root
USER 1000:1000

# Secrets are mounted at /run/secrets/ via Docker secrets
ENTRYPOINT ["./entrypoint.sh"]
