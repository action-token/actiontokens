import { Anton, Bungee, Bungee_Shade, Faster_One, UnifrakturCook } from "next/font/google";

/** The landing page's poster face (headlines) and blackletter (section tags), as in docs/mockups/home.html. */
export const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--lp-display" });
export const gothic = UnifrakturCook({
  weight: "700",
  subsets: ["latin"],
  variable: "--lp-gothic",
});

/** The sidebar's faces, as in the mockup: Faster One section titles, Bungee rows, Bungee Shade ACT. */
const bungee = Bungee({ weight: "400", subsets: ["latin"], variable: "--deck-bungee" });
const bungeeShade = Bungee_Shade({ weight: "400", subsets: ["latin"], variable: "--deck-shade" });
const fasterOne = Faster_One({ weight: "400", subsets: ["latin"], variable: "--deck-faster" });
export const deckFonts = `${bungee.variable} ${bungeeShade.variable} ${fasterOne.variable}`;
