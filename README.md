# Anchor Tug

Browsergame fuer einen Twitch-Streamer gegen den Chat. Ein Hype Train startet die Runde, Chat-Kommandos und Subs ziehen den Anker nach oben, Timing-Manoever des Streamers halten ihn am Meeresgrund.

## Lokale Entwicklung

1. `.env.example` als `.env` anlegen und Twitch-/Netlify-Werte eintragen.
2. In der Twitch Developer Console unter **OAuth Redirect URLs** exakt diese URL registrieren: `http://localhost:8888/api/auth/callback`. Kein abschliessender Slash, nicht `127.0.0.1` und nicht nur `http://localhost:8888`.
3. `pnpm netlify:dev` starten und `http://localhost:8888` oeffnen.

Fuer eine rein visuelle Vorschau ohne Twitch kann die App mit gesetztem `VITE_DEMO_MODE=true` ueber `pnpm dev` gestartet werden.

Das Bedienfeld **Testmodus** wird nur mit `VITE_TEST_MODE=true` angezeigt. Die Variable sollte in Produktion nicht gesetzt oder auf `false` gesetzt werden.

## Netlify-Konfiguration

Folgende Umgebungsvariablen muessen fuer Functions gesetzt werden:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_REDIRECT_URI`
- `TWITCH_ALLOWED_USER_ID`: optional; numerische Twitch-ID, falls nur ein Konto zugelassen werden soll
- `TOKEN_ENCRYPTION_KEY`: exakt 32 Zufallsbytes, Base64-kodiert

Die produktive Redirect-URL, zum Beispiel `https://example.netlify.app/api/auth/callback`, muss ebenfalls in der Twitch Developer Console stehen.

## Befehle

- `pnpm dev`: Vite ohne Functions
- `pnpm netlify:dev`: App und Netlify Functions gemeinsam
- `pnpm test`: Unit- und Integrationstests
- `pnpm build`: Typecheck und Produktionsbuild

## Anker-Asset

Der aktuelle Anker wird in `src/game/AnchorScene.ts` mit Phaser Graphics gezeichnet. Das finale PNG/WebP kann dort als Phaser-Asset geladen und anstelle des Containers verwendet werden.
