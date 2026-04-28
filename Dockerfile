FROM node:18

# Install FFMPEG buat kebutuhan stiker
RUN apt-get update && apt-get install -y ffmpeg

# Set folder kerja
WORKDIR /app

# Copy package.json dan install library
COPY package*.json ./
RUN npm install

# Copy semua file project
COPY . .

# Jalankan bot
CMD ["npm", "start"]