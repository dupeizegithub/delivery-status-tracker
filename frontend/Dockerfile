FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Vite dev server: hot module reload, source volume-mounted in compose —
# the demo is meant to be edited live.
CMD ["npm", "run", "dev"]
