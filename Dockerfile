FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --force

COPY . .

RUN npm run build

EXPOSE 3000
EXPOSE 3001

CMD ["npm", "start"]
