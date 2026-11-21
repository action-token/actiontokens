import { Anton, UnifrakturCook } from "next/font/google";

/** The landing page's poster face (headlines) and blackletter (section tags), as in docs/mockups/home.html. */
export const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--lp-display" });
export const gothic = UnifrakturCook({ weight: "700", subsets: ["latin"], variable: "--lp-gothic" });
