"use client";

import { useRef, useState } from "react";
import type { Place } from "@/lib/tags";
import { IconX } from "@/components/icons";
import { MiniMap } from "@/components/TripMap";
import styles from "./PlacePicker.module.css";

type Hit = Omit<Place, "arrive"> & {
  /** What sort of place, in words: "By", "Provins", "Land"… */
  type: string;
  /** Where in the country, coarse to fine: "Lazio", "Texas · Fannin County". */
  region: string | null;
};

const TYPES: Record<string, string> = {
  country: "Land",
  state: "Region",
  region: "Region",
  province: "Provins",
  county: "Område",
  municipality: "Kommune",
  city: "By",
  town: "Tettsted",
  village: "Landsby",
  hamlet: "Grend",
  suburb: "Bydel",
  city_district: "Bydel",
  island: "Øy",
};

// OSM names Thai, Japanese and other administrative areas by their full
// English title: "Chiang Mai City Municipality", "Phuket Province". The type
// label already says which it is. ponytail: English suffixes only; a bare
// " City" is left alone, or "Mexico City" would become Mexico.
function plainName(name: string) {
  return name.replace(/ (City Municipality|Municipality|Province|Prefecture|District)$/, "");
}

const LATIN = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]+$/u;

/** Norwegian if OSM has it, else the local name when it is in Latin script
 *  ("Roma", not "Rome"), else English ("Chiang Mai", not เชียงใหม่). */
function placeName(names: Record<string, string> | null, fallback: string) {
  const local = names?.name;
  return (
    names?.["name:nb"] ??
    names?.["name:no"] ??
    (local && LATIN.test(local) ? local : null) ??
    names?.["name:en"] ??
    fallback
  );
}

const COUNTRY_NAMES = new Intl.DisplayNames(["nb"], { type: "region" });

/**
 * OpenStreetMap's Nominatim: keyless, CORS-open, and it knows places by their
 * Norwegian names ("Roma", "Lisboa", "Spania"), which GeoNames-based geocoders
 * do not. Its usage policy allows a search per explicit request but not
 * search-as-you-type, hence the button. Only the search text leaves the
 * browser; the chosen place is stored encrypted with the tag.
 * `accept-language=nb,en` gives the regions in Norwegian or English rather
 * than their own script (เชียงใหม่); the place's own name is picked from
 * `namedetails` by placeName.
 */
async function geocode(query: string, signal: AbortSignal): Promise<Hit[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&namedetails=1&layer=address&accept-language=nb,en&limit=6`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Stedsøket svarte ikke.");
  const rows: any[] = await response.json();
  return rows
    .filter((row) => row.address?.country_code)
    .map((row) => {
      const cc = String(row.address.country_code).toUpperCase();
      const country = COUNTRY_NAMES.of(cc) ?? row.address.country;
      const isCountry = row.addresstype === "country";
      const address = row.address;
      const region = [address.state ?? address.province ?? address.region, address.county]
        .filter((part) => part && part !== row.name)
        .map(plainName);
      return {
        name: isCountry ? country : plainName(placeName(row.namedetails, row.name)),
        country,
        cc,
        lat: Number(row.lat),
        lon: Number(row.lon),
        kind: isCountry ? "country" : "city",
        type: TYPES[row.addresstype] ?? "Sted",
        region: isCountry ? null : [...new Set(region)].join(" · ") || null,
      };
    });
}

/**
 * A trip's stops: a search field over the geocoder, then the chosen cities and
 * countries, each with the day it was reached. The arrival dates are what split
 * the trip's spending between stops on /innsikt; a country around its cities
 * can be left undated.
 */
export default function PlacePicker({
  places,
  onChange,
  start,
  end,
}: {
  places: Place[];
  onChange: (places: Place[]) => void;
  start: string;
  end: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const pending = useRef<AbortController | null>(null);

  async function search() {
    const text = query.trim();
    if (text.length < 2 || searching) return;
    pending.current?.abort();
    const controller = (pending.current = new AbortController());
    setSearching(true);
    setProblem(null);
    try {
      const rows = await geocode(text, controller.signal);
      setHits(rows);
      if (!rows.length) setProblem("Fant ingen by eller land med det navnet.");
    } catch (cause) {
      if (!controller.signal.aborted) {
        setProblem(cause instanceof Error ? cause.message : "Stedsøket feilet.");
      }
    }
    setSearching(false);
  }

  function add({ region: _region, type: _type, ...hit }: Hit) {
    // The first city of a dated trip starts on its first day; later ones are
    // left for the owner to date. A country is never dated by default: it is
    // usually the frame around its cities, and dating it would take their days.
    const first = hit.kind === "city" && !places.some((place) => place.arrive);
    onChange([...places, { ...hit, arrive: first && start ? start : null }]);
    setQuery("");
    setHits([]);
  }

  return (
    <div className={styles["picker"]}>
      {places.length ? (
        <ol className={styles["list"]}>
          {places.map((place, index) => (
            <li key={`${place.name}-${place.lat}-${index}`} className={styles["row"]}>
              <span className={styles["name"]}>
                <strong>{place.name}</strong>
                <span className="helper">
                  {place.kind === "country" ? "Land" : place.country}
                </span>
              </span>
              <input
                type="date"
                value={place.arrive ?? ""}
                min={start || undefined}
                max={end || undefined}
                onChange={(event) =>
                  onChange(
                    places.map((row, i) =>
                      i === index ? { ...row, arrive: event.target.value || null } : row
                    )
                  )
                }
                aria-label={`Ankomst ${place.name}`}
                title="Første dag her"
              />
              <button
                className="icon-btn icon-btn-dismiss"
                type="button"
                onClick={() => onChange(places.filter((_, i) => i !== index))}
                aria-label={`Fjern ${place.name}`}
              >
                <IconX />
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      <div className={styles["search"]}>
        <div className={styles["search-row"]}>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHits([]);
              setProblem(null);
            }}
            onKeyDown={(event) => {
              // Enter searches rather than submitting anything around it.
              if (event.key === "Enter") {
                event.preventDefault();
                search();
              }
            }}
            placeholder="Legg til by eller land"
            aria-label="Søk etter by eller land"
          />
          <button
            className="btn"
            type="button"
            onClick={search}
            disabled={searching || query.trim().length < 2}
          >
            {searching ? "Søker…" : "Søk"}
          </button>
        </div>
        {hits.length ? (
          <ul className={styles["hits"]} role="listbox" aria-label="Treff">
            {hits.map((hit) => (
              <li key={`${hit.name}-${hit.lat}-${hit.lon}`}>
                <button type="button" role="option" aria-selected="false" onClick={() => add(hit)}>
                  <MiniMap lon={hit.lon} lat={hit.lat} country={hit.kind === "country"} />
                  <span className={styles["hit-text"]}>
                    <strong>{hit.name}</strong>
                    <span className="helper">
                      {[hit.type, hit.region, hit.kind === "city" ? hit.country : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : problem ? (
          <span className="helper">{problem}</span>
        ) : null}
      </div>
    </div>
  );
}
