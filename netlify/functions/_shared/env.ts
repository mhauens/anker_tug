export function requireEnv(name: string): string {
  const value = Netlify.env.get(name) ?? process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return (Netlify.env.get(name) ?? process.env[name]) || undefined;
}

export function twitchLoginConfig() {
  return {
    clientId: requireEnv("TWITCH_CLIENT_ID"),
    redirectUri: requireEnv("TWITCH_REDIRECT_URI"),
  };
}

export function twitchConfig() {
  return {
    ...twitchLoginConfig(),
    clientSecret: requireEnv("TWITCH_CLIENT_SECRET"),
    allowedUserId: optionalEnv("TWITCH_ALLOWED_USER_ID"),
    encryptionKey: requireEnv("TOKEN_ENCRYPTION_KEY"),
  };
}
