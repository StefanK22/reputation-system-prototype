FROM eclipse-temurin:17-jdk-jammy AS build

ARG DAML_VERSION=3.4.11
RUN apt-get update && apt-get install -y curl maven && rm -rf /var/lib/apt/lists/*
RUN curl -sSL https://get.daml.com/ | sh -s -- ${DAML_VERSION}
ENV PATH="/root/.daml/bin:$PATH"

WORKDIR /build/canton
COPY --from=canton /app/.daml/dist/reputation-0.0.1.dar .daml/dist/reputation-0.0.1.dar

WORKDIR /build/reputation-system
COPY pom.xml .
COPY src ./src

RUN mvn package -DskipTests

FROM eclipse-temurin:17-jre-jammy
RUN apt-get update && apt-get install -y curl python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /build/reputation-system/target/*.jar app.jar
COPY entrypoint.sh entrypoint.sh
RUN chmod +x entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
