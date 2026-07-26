# Standalone 24/7 Discord bot: /connect joins a voice channel and plays live
# audio from Streamio. Now deployed on Flex-3 (real CPU/RAM) instead of the
# Micro instance, so @discordjs/opus's native C-compiled encoder is used
# instead of opusscript (pure JS) - opusscript was suspected as the actual
# encode-quality/latency bottleneck on Micro's fractional CPU.
FROM node:20-slim

WORKDIR /app

# ffmpeg for the audio pull; python3/build-essential to compile @discordjs/opus's
# native bindings (removed after install - only needed during npm install).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package.json .
RUN npm install --omit=dev \
    && apt-get purge -y python3 build-essential \
    && apt-get autoremove -y

COPY . .

CMD ["node", "bot.js"]
