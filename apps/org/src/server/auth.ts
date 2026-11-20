import { createAuthOptions, getServerAuthSession } from "@actiontokens/auth";
import { db } from "@actiontokens/db/server";

export const authOptions = createAuthOptions({ app: "org", db });

/** The signed-in session in a server component or route handler. */
export const getSession = () => getServerAuthSession(authOptions);
