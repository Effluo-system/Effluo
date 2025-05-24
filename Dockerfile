FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --force

# Copy app source code
COPY . .

# Copy start.sh (explicitly overwrite if needed)
COPY start.sh ./start.sh

# Copy private keys
COPY private/*.pem ./private/

# Make sure the script is executable
RUN chmod +x ./start.sh

EXPOSE 3000

# Use full path to avoid ./ issues
CMD ["sh", "start.sh"]
