FROM node:18-alpine as build
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm install -g @angular/cli && npm install
COPY . .
ENV PATH="/usr/local/bin:${PATH}"
RUN chmod +x /usr/local/bin/ng
RUN ng build --output-path=./dist/plan-rh-app

FROM nginx:stable-alpine
COPY --from=build /usr/src/app/dist/plan-rh-app/browser /usr/share/nginx/html
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]