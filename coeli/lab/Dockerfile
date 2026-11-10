FROM node:24.17.0-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
USER node
WORKDIR /lab
COPY --chown=node:node application.mjs evaluator.mjs runner.mjs ./
ENTRYPOINT ["node", "--max-old-space-size=128", "runner.mjs"]
CMD ["/scratch/round", "all", "purple", "laboratory"]
