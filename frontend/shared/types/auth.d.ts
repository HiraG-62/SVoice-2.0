declare module '#auth-utils' {
  interface User {
    discordId: string;
    discordAuth: boolean;
    gamerTag: string;
    devLogin?: boolean;
  }
}

export {};
