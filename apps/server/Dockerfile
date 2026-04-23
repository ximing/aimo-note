FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/tsconfig.json ./apps/server/
COPY apps/server/src ./apps/server/src
COPY packages/dto/package.json packages/dto/tsconfig.json packages/dto/rollup.config.js ./packages/dto/
COPY packages/dto/src ./packages/dto/src
COPY config/config-typescript/package.json config/config-typescript/base.json ./config/config-typescript/
COPY config/rollup-config/package.json config/rollup-config/index.js ./config/rollup-config/
COPY config/eslint-config/package.json ./config/eslint-config/
COPY config/jest-presets/package.json ./config/jest-presets/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --filter @aimo-note/server... --frozen-lockfile
RUN pnpm --filter @aimo-note/dto build
RUN pnpm --filter @aimo-note/server build
RUN pnpm --filter @aimo-note/server --prod deploy --legacy /app

FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
