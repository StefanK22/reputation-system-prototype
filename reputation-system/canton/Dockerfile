FROM eclipse-temurin:21-jre-jammy
ARG DAML_VERSION=3.4.11
RUN apt-get update && apt-get install -y curl netcat-openbsd && rm -rf /var/lib/apt/lists/*
RUN curl -sSL https://get.daml.com/ | sh -s -- ${DAML_VERSION}
ENV PATH="/root/.daml/bin:$PATH"
WORKDIR /app/daml
COPY daml/ ./
COPY canton-start.sh /app/canton-start.sh
RUN daml build && chmod +x /app/canton-start.sh
EXPOSE 6865 7575
CMD ["/app/canton-start.sh"]
