FROM node:23

WORKDIR /matches

COPY . .

RUN npm ci 
RUN npm run build

CMD ["node", "dist/main.js"]
