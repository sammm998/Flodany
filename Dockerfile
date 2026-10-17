# Plattformen (apps/platform) för Railway: byggs med Vite och serveras av scripts/serva-plattform.mjs.
# Databasen, inloggningen och serverfunktionerna (motor, legacy, assistent) körs på Supabase, inte här.
# Utan VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY (Variables i Railway) visar sidan att databasen inte är kopplad än.
FROM node:24-alpine AS bygg
WORKDIR /app
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SENTRY_DSN
ARG VITE_FLODIA_MILJO
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY VITE_SENTRY_DSN=$VITE_SENTRY_DSN VITE_FLODIA_MILJO=$VITE_FLODIA_MILJO
COPY . .
# Inga installationsskript: de laddar ner Supabase CLI och webbläsare, som bygget inte behöver.
RUN npm ci --ignore-scripts --no-audit --no-fund && npm run build -w @flodia/platform

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=bygg /app/apps/platform/dist ./apps/platform/dist
COPY --from=bygg /app/scripts/serva-plattform.mjs ./scripts/serva-plattform.mjs
# Ett package.json med start, ifall Railway startar med npm start i stället för CMD.
RUN echo '{"name":"flodia-plattform","private":true,"type":"module","scripts":{"start":"node scripts/serva-plattform.mjs"}}' > package.json
USER node
EXPOSE 8080
CMD ["node", "scripts/serva-plattform.mjs"]
