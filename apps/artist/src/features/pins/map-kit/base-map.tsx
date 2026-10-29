"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "next-themes";
import { forwardRef, type ReactNode, useEffect, useSyncExternalStore } from "react";
import MapGL, { NavigationControl, useMap, type MapProps, type MapRef } from "react-map-gl/mapbox";

import { cn } from "@bandcoin/ui/lib/cn";

import { MAPBOX_TOKEN } from "../mapbox";

export const WORLD_VIEW = { latitude: 22.55, longitude: 0, zoom: 2.4 };

const STYLE = { light: "mapbox://styles/mapbox/streets-v12", dark: "mapbox://styles/mapbox/dark-v11" } as const;

const noSubscribe = () => () => undefined;
/** False while rendering on the server, true in the browser. */
const useIsClient = () => useSyncExternalStore(noSubscribe, () => true, () => false);

/**
 * Mapbox only resizes its canvas with the window. Keep it filling its box when
 * the box itself changes size (layout settling, panels opening), or part of the
 * map stays blank.
 */
function FollowContainerSize() {
  const { current } = useMap();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [current]);
  return null;
}

/**
 * The portal's one map: Mapbox in the portal's light or dark look, with the same
 * token everywhere. Children are react-map-gl layers, markers and controls.
 */
export const BaseMap = forwardRef<
  MapRef,
  Omit<MapProps, "mapboxAccessToken" | "mapStyle"> & {
    children?: ReactNode;
    className?: string;
    controls?: boolean;
    controlsPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  }
>(function BaseMap({ children, className, controls = true, controlsPosition = "bottom-right", ...props }, ref) {
  const { resolvedTheme } = useTheme();
  const mounted = useIsClient();
  // Wait for the browser so the map is created with the real theme; swapping the style while it loads flashes.
  if (!mounted || !resolvedTheme) return <div className={cn("relative size-full", className)} />;

  return (
    <div className={cn("relative size-full", className)}>
      <MapGL
        ref={ref}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={STYLE[resolvedTheme === "dark" ? "dark" : "light"]}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        minZoom={1.5}
        maxZoom={20}
        {...props}
      >
        <FollowContainerSize />
        {controls && <NavigationControl position={controlsPosition} showCompass={false} />}
        {children}
      </MapGL>
    </div>
  );
});
