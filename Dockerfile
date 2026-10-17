# Plattformen (apps/platform) för Railway: byggs med Vite och serveras av scripts/serva-plattform.mjs.
# Databasen, inloggningen och serverfunktionerna (motor, legacy, assistent) körs på Supabase, inte här.
# Utan VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY (Variables i Railway) körs demoläget: servern spelar Supabase
# med påhittad data (packages/server/demo.ts). Se docs/railway.md.
FROM node:24-alpine AS bygg
WORKDIR /app
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SENTRY_DSN
ARG VITE_FLODIA_MILJO
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY VITE_SENTRY_DSN=$VITE_SENTRY_DSN VITE_FLODIA_MILJO=$VITE_FLODIA_MILJO
COPY . .
# Inga installationsskript: de laddar ner Supabase CLI och webbläsare, som bygget inte behöver.
# npm run build bygger plattformen och demoläget (dist-demo), som används när Supabase saknas.
RUN npm ci --ignore-scripts --no-audit --no-fund && npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=bygg /app/apps/platform/dist ./apps/platform/dist
COPY --from=bygg /app/scripts/serva-plattform.mjs ./scripts/serva-plattform.mjs
COPY --from=bygg /app/dist-demo ./dist-demo
# Samma upplägg som repot (en arbetsyta @flodia/platform), så att både CMD, npm start och
# npm run start --workspace=@flodia/platform (Railways förval för en monorepo) startar servern.
RUN echo '{"name":"flodia","private":true,"type":"module","workspaces":["apps/platform"],"scripts":{"start":"node scripts/serva-plattform.mjs"}}' > package.json \
 && echo '{"name":"@flodia/platform","private":true,"type":"module","scripts":{"start":"node ../../scripts/serva-plattform.mjs"}}' > apps/platform/package.json
USER node
EXPOSE 8080
CMD ["node", "scripts/serva-plattform.mjs"]
