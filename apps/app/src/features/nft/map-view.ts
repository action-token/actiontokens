type Point = { lat: number; lng: number };

/** Close enough to see the street, for one place or places right next to each other. */
const CLOSE_ZOOM = 14;

/** Where the map starts: on the one place, or framing them all. */
export function placesView(places: Point[]) {
  const lats = places.map((place) => place.lat);
  const lngs = places.map((place) => place.lng);
  const [west, east] = [Math.min(...lngs), Math.max(...lngs)];
  const [south, north] = [Math.min(...lats), Math.max(...lats)];
  if (west === east && south === north)
    return { latitude: south, longitude: west, zoom: CLOSE_ZOOM };
  return {
    bounds: [
      [west, south],
      [east, north],
    ] as [[number, number], [number, number]],
    fitBoundsOptions: { padding: 56, maxZoom: CLOSE_ZOOM },
  };
}

export const directionsLink = (place: Point) =>
  `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
