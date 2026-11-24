import { Anton, Bungee, UnifrakturCook } from "next/font/google";

/** The landing page's poster face (headlines) and blackletter (section tags), as in docs/mockups/home.html. */
export const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--lp-display" });
export const gothic = UnifrakturCook({
  weight: "700",
  subsets: ["latin"],
  variable: "--lp-gothic",
});

/** The sidebar's faces: Anton section titles (the landing's poster face) and Bungee (the account card). */
const bungee = Bungee({ weight: "400", subsets: ["latin"], variable: "--deck-bungee" });
export const deckFonts = `${bungee.variable} ${anton.variable}`;
