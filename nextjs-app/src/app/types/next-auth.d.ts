import { DefaultSession, DefaultUser } from 'next-auth';

declare module "next-auth" {
 interface Session {
    user: {
      id: string
      image: string
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    id: string
    image: string
  }
}
