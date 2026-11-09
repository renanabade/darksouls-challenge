# The site and the API, as one image. Configure it with JWT_SECRET and SPRING_DATASOURCE_URL, _USERNAME and _PASSWORD.
FROM node:24-alpine AS site
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npx ng build

FROM maven:3.9-eclipse-temurin-21 AS server
WORKDIR /build
COPY pom.xml ./
COPY core/pom.xml core/
COPY cli/pom.xml cli/
COPY server/pom.xml server/
RUN mvn -q -B -pl server -am dependency:go-offline -DskipTests || true
COPY core/src core/src
COPY server/src server/src
COPY data data
COPY --from=site /build/web/dist web/dist
RUN mvn -q -B -pl server -am -DskipTests package

FROM eclipse-temurin:21-jre
RUN useradd --system --no-create-home darksouls
USER darksouls
COPY --from=server /build/server/target/darksouls-server.jar /app/server.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/server.jar"]
