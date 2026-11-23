import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import toast from "react-hot-toast";

import { firebaseAuth } from "../../firebase/client";
import { signInWithApple, signInWithSocialProvider } from "../../session/sign-in-with-credentials";
import { WalletType } from "../../wallet-type";
import type { WalletProvider } from "../wallet-provider";
import { requestCustodialAccount } from "./account-service";
import { submitCustodialTransaction } from "./submit-custodial-transaction";

const LOGIN_PENDING = { error: "Login error", loading: "Please Wait", success: null } as const;

/** Creates the app session for a Firebase social user, then makes sure their Stellar account exists. */
async function startSessionAndProvisionAccount(
  credential: UserCredential,
  email: string,
  signIn: (idToken: string) => Promise<{ ok?: boolean; error?: string | null } | undefined>,
  options: { provisionAccount: boolean },
): Promise<void> {
  const { user } = credential;
  const result = await toast.promise(user.getIdToken().then(signIn), LOGIN_PENDING);

  if (result?.error) toast.error(result.error);
  if (!result?.ok) return;
  toast.success("Login Successfully");

  if (options.provisionAccount) {
    await toast.promise(requestCustodialAccount({ uid: user.uid, email }), {
      loading: "Getting public key...",
      success: "Received public key",
      error: "Unable to get public key",
    });
  }
}

/**
 * Firebase refuses an Apple sign-in whose email already belongs to a Google or
 * email account ("account exists with a different credential"). The error still
 * carries Apple's identity token, so the server signs the person in by that
 * verified email instead: same account and wallet as their other sign-ins.
 * Resolves `false` when the error isn't one it can recover from.
 */
async function signInWithAppleOnServer(error: unknown): Promise<boolean> {
  const firebaseError = error as FirebaseError;
  if (firebaseError?.code !== "auth/account-exists-with-different-credential") return false;
  const appleToken = OAuthProvider.credentialFromError(firebaseError)?.idToken;
  const email = firebaseError.customData?.email;
  if (!appleToken || typeof email !== "string") return false;

  const result = await toast.promise(
    signInWithApple({ email, appleToken, walletType: WalletType.apple }),
    LOGIN_PENDING,
  );
  if (result?.error) toast.error(result.error);
  else if (result?.ok) toast.success("Login Successfully");
  return true;
}

export const googleProvider: WalletProvider = {
  type: WalletType.google,
  label: "Google",

  async login() {
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/userinfo.email");

    try {
      const credential = await signInWithPopup(firebaseAuth, provider);
      const email = credential.user.providerData[0]?.email;
      if (!email) return void toast.error("Email dont exist");

      await startSessionAndProvisionAccount(
        credential,
        email,
        (token) => signInWithSocialProvider({ email, token, walletType: WalletType.google }),
        { provisionAccount: true },
      );
    } catch (error) {
      console.error("[Google sign-in] failed", error);
    }
  },

  signAndSubmit: (xdr) => submitCustodialTransaction(xdr),
};

export const appleProvider: WalletProvider = {
  type: WalletType.apple,
  label: "Apple",

  async login() {
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");

    try {
      const credential = await signInWithPopup(firebaseAuth, provider);
      const email = credential.user.email;
      if (!email) {
        return void toast.error("Please share you email with us. without we can't proceed");
      }

      await startSessionAndProvisionAccount(
        credential,
        email,
        (token) => signInWithApple({ email, token, walletType: WalletType.apple }),
        { provisionAccount: true },
      );
    } catch (error) {
      if (await signInWithAppleOnServer(error)) return;
      console.error("[Apple sign-in] failed", error);
      if ((error as FirebaseError)?.code === "auth/provider-already-linked") {
        toast.error(
          "This account already has another Apple sign-in connected. Use Google or email for now, or contact support.",
        );
      }
    }
  },

  signAndSubmit: (xdr) => submitCustodialTransaction(xdr),
};

export const facebookProvider: WalletProvider = {
  type: WalletType.facebook,
  label: "Facebook",

  async login() {
    const provider = new FacebookAuthProvider();
    provider.addScope("email");
    provider.setCustomParameters({ display: "popup" });

    try {
      const credential = await signInWithPopup(firebaseAuth, provider);
      const email = credential.user.providerData[0]?.email;
      if (!email) return void toast.error("Email dont exist");

      const idToken = await credential.user.getIdToken();
      await signInWithSocialProvider({ email, token: idToken, walletType: WalletType.facebook });
    } catch (error) {
      console.error("[Facebook sign-in] failed", error);
    }
  },

  signAndSubmit: (xdr) => submitCustodialTransaction(xdr),
};
