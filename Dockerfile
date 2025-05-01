FROM node:22

WORKDIR /chime_back

# Install app dependencies
COPY package*.json .
RUN npm install 
RUN npm add global nodemon

COPY . .

EXPOSE 3000

CMD [ "npm", "run", "dev" ]

