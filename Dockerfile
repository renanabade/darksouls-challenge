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
WORKDIR /app
COPY --from=server /build/server/target/darksouls-server.jar /tmp/server.jar
RUN java -Djarmode=tools -jar /tmp/server.jar extract --destination /app && rm /tmp/server.jar

# A container that sleeps starts often, so the classes it loads on the way up are archived here (CDS), which cut the start by about a
# third. The archive comes from a start that stops once the context is up, with no database: Flyway is off, and Hibernate is told the
# dialect instead of asking for it. The secret is only for this run. The collector must match the one the server runs with.
RUN JWT_SECRET=only-for-archiving-the-classes-never-for-tokens \
    java -XX:+UseSerialGC -XX:ArchiveClassesAtExit=/app/server.jsa \
      -Dspring.context.exit=onRefresh \
      -Dspring.flyway.enabled=false \
      -Dgeneration.background=false \
      -Dspring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false \
      -Dspring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect \
      -jar /app/server.jar > /dev/null \
    && test -s /app/server.jsa

USER darksouls
# Logs one JSON object per line, for whatever reads them.
ENV LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs
EXPOSE 8080
# One vCPU: the serial collector is what the JVM would choose there anyway.
ENTRYPOINT ["java", "-XX:+UseSerialGC", "-XX:SharedArchiveFile=/app/server.jsa", "-XX:MaxRAMPercentage=75", "-jar", "/app/server.jar"]
