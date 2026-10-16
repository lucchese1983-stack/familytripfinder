// Free, keyless live data: OpenStreetMap (Overpass) + Wikipedia geosearch, queried directly from the device.
(function () {
    const OVERPASS_MIRRORS = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ];
    const GEO_CACHE = "familytrip_geo_cache";

    const toRad = (d) => (d * Math.PI) / 180;
    function distanceKm(a, b) {
        const dLat = toRad(b.lat - a.lat);
        const dLon = toRad(b.lon - a.lon);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
        return 6371 * 2 * Math.asin(Math.sqrt(h));
    }

    const timeout = (ms, signal) => {
        const ctrl = new AbortController();
        const id = setTimeout(() => ctrl.abort(), ms);
        signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
        return { signal: ctrl.signal, done: () => clearTimeout(id) };
    };

    async function fetchJSON(url, init, ms, signal) {
        const t = timeout(ms, signal);
        try {
            const res = await fetch(url, { ...init, signal: t.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } finally {
            t.done();
        }
    }

    async function geocode(query, signal) {
        let cache = {};
        try { cache = JSON.parse(localStorage.getItem(GEO_CACHE)) || {}; } catch {}
        if (cache[query]) return cache[query];
        const data = await fetchJSON(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&accept-language=it&q=${encodeURIComponent(query)}`,
            {}, 8000, signal,
        );
        if (!data[0]) return null;
        const point = { lat: Number(data[0].lat), lon: Number(data[0].lon) };
        cache[query] = point;
        try { localStorage.setItem(GEO_CACHE, JSON.stringify(cache)); } catch {}
        return point;
    }

    const KIND_INFO = {
        theme_park: { label: "Parco divertimenti", category: "Parchi & Natura", stroller: true, picnic: false, dogs: false, rank: 0 },
        water_park: { label: "Parco acquatico", category: "Parchi & Natura", stroller: true, picnic: false, dogs: false, season: "Estate", rank: 0 },
        zoo: { label: "Zoo e parco faunistico", category: "Parchi & Natura", stroller: true, picnic: true, dogs: false, rank: 0 },
        aquarium: { label: "Acquario", category: "Parchi & Natura", stroller: true, picnic: false, dogs: false, rank: 0 },
        farm: { label: "Fattoria didattica", category: "Parchi & Natura", stroller: true, picnic: true, dogs: false, rank: 1 },
        museum: { label: "Museo", category: "Treni & Tour", stroller: true, picnic: false, dogs: false, rank: 2 },
        castle: { label: "Castello e borgo", category: "Treni & Tour", stroller: false, picnic: true, dogs: true, rank: 2 },
        railway: { label: "Trenino, funivia o tour", category: "Treni & Tour", stroller: true, picnic: false, dogs: true, rank: 1 },
        park: { label: "Parco e giardino", category: "Parchi & Natura", stroller: true, picnic: true, dogs: true, rank: 2 },
        nature: { label: "Natura e sentieri", category: "Parchi & Natura", stroller: false, picnic: true, dogs: true, rank: 2 },
        lake: { label: "Lago e acqua", category: "Parchi & Natura", stroller: true, picnic: true, dogs: true, rank: 2 },
        attraction: { label: "Attrazione", category: "Parchi & Natura", stroller: true, picnic: false, dogs: false, rank: 3 },
    };

    const TIPS = {
        theme_park: "Arrivate all'apertura: nella prima ora le code per le attrazioni sono molto più corte.",
        water_park: "Portate ciabatte antiscivolo e crema solare: le zone baby di solito sono vicino all'ingresso.",
        zoo: "Al mattino gli animali sono più attivi: lasciate i rettilari e le zone coperte al pomeriggio.",
        aquarium: "Controllate gli orari dei pasti degli animali: sono il momento preferito dai bambini.",
        farm: "Chiamate prima: molte fattorie didattiche fanno laboratori solo su prenotazione.",
        museum: "Chiedete in biglietteria se ci sono percorsi o schede gioco per bambini.",
        castle: "Spesso ci sono scale e acciottolato: meglio il marsupio del passeggino.",
        railway: "Prenotate i biglietti online nei weekend: le corse per famiglie si riempiono presto.",
        park: "Cercate le aree giochi e una zona all'ombra per la merenda.",
        nature: "Scegliete un percorso ad anello breve e verificate il meteo prima di partire.",
        lake: "Il lungolago è perfetto per una passeggiata: portate un cambio per i più piccoli.",
        attraction: "Verificate orari e biglietti sul sito ufficiale prima di partire.",
    };

    function kindFromOsm(tags) {
        if (tags.tourism === "theme_park") return "theme_park";
        if (tags.leisure === "water_park") return "water_park";
        if (tags.tourism === "zoo") return "zoo";
        if (tags.tourism === "aquarium") return "aquarium";
        if (tags.tourism === "museum") return "museum";
        if (tags.historic === "castle") return "castle";
        if (tags.aerialway || tags.railway) return "railway";
        if (tags.leisure === "nature_reserve" || tags.boundary === "protected_area") return "nature";
        if (tags.leisure === "park" || tags.leisure === "garden") return "park";
        if (/farm|animal/.test(`${tags.tourism} ${tags.attraction}`)) return "farm";
        return "attraction";
    }

    const WIKI_KINDS = [
        [/parco (divertimenti|tematico|avventura)|luna park|gardaland|leolandia|mirabilandia/, "theme_park"],
        [/parco acquatico|acquapark|aquapark/, "water_park"],
        [/\bzoo\b|faunistic|safari|bioparco/, "zoo"],
        [/acquario/, "aquarium"],
        [/fattoria/, "farm"],
        [/museo|planetario|osservatorio astronomico|science center/, "museum"],
        [/castello|rocca|fortezza|\bforte\b|borgo medievale/, "castle"],
        [/funivia|funicolare|cabinovia|ferrovia turistica|trenino/, "railway"],
        [/orto botanico|giardino|parco (urbano|pubblico|naturale|regionale|nazionale)|\bparco\b/, "park"],
        [/riserva|oasi|cascat|grott|sentiero|gola|monte|valle/, "nature"],
        [/\blago\b|laghetto|lungolago/, "lake"],
    ];
    const WIKI_EXCLUDE = /stazione|provincia|comune|frazione|quartiere|diocesi|chiesa|basilica|cattedrale|parrocchia|cimitero|ospedale|scuola|liceo|universit|stadio|aeroporto|autostrada|strada|\bvia\b|piazza|palazzo|ponte|torrente|fiume|azienda|societ|squadra|elezioni/;

    async function fromOverpass(center, radiusKm, signal) {
        const r = Math.round(radiusKm * 1000);
        const q = `[out:json][timeout:20];(
nwr["tourism"~"^(theme_park|zoo|aquarium)$"](around:${r},${center.lat},${center.lon});
nwr["leisure"="water_park"](around:${r},${center.lat},${center.lon});
nwr["tourism"="museum"]["name"](around:${Math.min(r, 15000)},${center.lat},${center.lon});
nwr["historic"="castle"]["name"]["tourism"](around:${r},${center.lat},${center.lon});
nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]["wikidata"](around:${r},${center.lat},${center.lon});
nwr["tourism"="attraction"]["name"]["wikidata"](around:${r},${center.lat},${center.lon});
nwr["attraction"~"animal|farm"]["name"](around:${r},${center.lat},${center.lon});
);out center tags 60;`;
        for (const url of OVERPASS_MIRRORS) {
            try {
                const data = await fetchJSON(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: `data=${encodeURIComponent(q)}`,
                }, 15000, signal);
                return (data.elements || []).flatMap((el) => {
                    const tags = el.tags || {};
                    const lat = el.lat ?? el.center?.lat;
                    const lon = el.lon ?? el.center?.lon;
                    if (!tags.name || lat == null) return [];
                    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
                    return [{
                        source: "osm",
                        name: tags["name:it"] || tags.name,
                        kind: kindFromOsm(tags),
                        lat, lon,
                        town: tags["addr:city"] || "",
                        address: [street, tags["addr:city"]].filter(Boolean).join(", "),
                        hours: tags.opening_hours || "",
                        website: tags.website || tags["contact:website"] || "",
                        insta: tags["contact:instagram"] || "",
                        fb: tags["contact:facebook"] || "",
                        dogs: tags.dog === "yes" ? true : tags.dog === "no" ? false : undefined,
                        stroller: tags.wheelchair === "yes" ? true : undefined,
                        wiki: tags.wikipedia || "",
                        description: tags.description || "",
                    }];
                });
            } catch (err) {
                if (signal?.aborted) throw err;
            }
        }
        return [];
    }

    async function fromWikipedia(center, signal) {
        const url = `https://it.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${center.lat}|${center.lon}&ggsradius=10000&ggslimit=50&prop=coordinates|pageimages|extracts|description|info&inprop=url&exintro=1&explaintext=1&exsentences=2&exlimit=max&piprop=thumbnail&pithumbsize=640`;
        const data = await fetchJSON(url, {}, 12000, signal);
        return Object.values(data.query?.pages || {}).flatMap((p) => {
            const text = `${p.title} ${p.description || ""}`.toLowerCase();
            if (WIKI_EXCLUDE.test(p.title.toLowerCase()) || !p.coordinates?.[0]) return [];
            const match = WIKI_KINDS.find(([re]) => re.test(text));
            if (!match) return [];
            return [{
                source: "wiki",
                name: p.title,
                kind: match[1],
                lat: p.coordinates[0].lat,
                lon: p.coordinates[0].lon,
                image: p.thumbnail?.source || "",
                description: p.extract || p.description || "",
                website: p.fullurl || "",
            }];
        });
    }

    const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

    function merge(osm, wiki) {
        const byName = new Map();
        for (const w of wiki) byName.set(normalize(w.name), w);
        const out = osm.map((o) => {
            const wikiTitle = o.wiki.replace(/^it:/, "");
            const w = byName.get(normalize(wikiTitle || o.name)) || byName.get(normalize(o.name));
            if (w) byName.delete(normalize(w.name));
            return w ? { ...o, image: w.image, description: o.description || w.description, website: o.website || w.website } : o;
        });
        return [...out, ...byName.values()];
    }

    async function scanZone({ center, radiusKm = 20, region, city, zone, signal }) {
        const [osm, wiki] = await Promise.all([
            fromOverpass(center, radiusKm, signal).catch((e) => { if (signal?.aborted) throw e; return []; }),
            fromWikipedia(center, signal).catch((e) => { if (signal?.aborted) throw e; return []; }),
        ]);
        const seen = new Set();
        const items = merge(osm, wiki)
            .map((p) => ({ ...p, km: distanceKm(center, p) }))
            .filter((p) => p.km <= radiusKm * 1.2 && !seen.has(normalize(p.name)) && seen.add(normalize(p.name)))
            .sort((a, b) => (KIND_INFO[a.kind].rank - KIND_INFO[b.kind].rank) || (a.km - b.km))
            .slice(0, 14);

        const scannedAt = new Date().toISOString();
        const places = items.map((p, i) => {
            const info = KIND_INFO[p.kind];
            const km = Math.round(p.km * 10) / 10;
            return {
                id: `live_${normalize(p.name).replace(/ /g, "_")}_${i}`,
                title: p.name,
                category: info.category,
                kind: p.kind,
                region,
                city: city || p.town || zone,
                season: info.season || "Tutte",
                minAge: "Tutte le età",
                stroller: p.stroller ?? info.stroller,
                picnic: info.picnic,
                dogs: p.dogs ?? info.dogs,
                rating: Math.round((4.8 - info.rank * 0.1) * 10) / 10,
                image: p.image || "",
                description: (p.description || `${info.label} a ${km} km da ${zone}.`).slice(0, 320),
                parentTip: TIPS[p.kind],
                dateInfo: p.hours || "Verifica orari sul sito",
                address: p.address || "",
                lat: p.lat,
                lon: p.lon,
                distanceKm: km,
                sourceUrl: p.website || "",
                socialInsta: /^https?:/.test(p.insta || "") ? p.insta : "",
                socialFb: /^https?:/.test(p.fb || "") ? p.fb : "",
                live: true,
            };
        });
        return { places, creators: [], zone, scannedAt };
    }

    const ZAINO_BASE = ["Acqua e merenda", "Salviette e gel igienizzante", "Cambio completo per i più piccoli", "Power bank per il telefono"];
    const ZAINO_EXTRA = {
        water_park: ["Costume, accappatoio e ciabatte", "Crema solare alta protezione", "Braccioli o giubbotto per i piccoli"],
        nature: ["Scarpe da trekking", "K-way", "Repellente per insetti"],
        park: ["Telo da picnic", "Pallone o frisbee"],
        lake: ["Telo da picnic", "Cappellino e crema solare"],
        zoo: ["Cappellino", "Binocolo per bambini"],
        theme_park: ["Marsupio per documenti", "Cappellino e crema solare"],
        castle: ["Marsupio porta-bimbo", "Scarpe comode"],
    };
    const SEASON_EXTRA = { Estate: "Crema solare e cappellino", Inverno: "Guanti, berretto e un cambio caldo", Autunno: "K-way e felpa", Primavera: "Felpa leggera" };

    function currentSeason() {
        const m = new Date().getMonth();
        return m <= 1 || m === 11 ? "Inverno" : m <= 4 ? "Primavera" : m <= 7 ? "Estate" : "Autunno";
    }

    function buildDayPlan(place, allPlaces) {
        const kind = place.kind || (place.category === "Treni & Tour" ? "railway" : place.category === "Sagre & Feste" ? "attraction" : "park");
        const age = place.minAge || "Tutte le età";
        const hasCoords = place.lat != null;
        const nearby = allPlaces
            .filter((p) => p.id !== place.id)
            .map((p) => ({ p, km: hasCoords && p.lat != null ? distanceKm(place, p) : p.city === place.city ? 3 : Infinity }))
            .filter((x) => x.km <= 20)
            .sort((a, b) => (a.p.category === place.category) - (b.p.category === place.category) || a.km - b.km)
            .slice(0, 2);
        const drive = (km) => `${Math.max(5, Math.round((km * 1.3) / 45 * 60))} min in auto`;
        const mapsSearch = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
        const where = hasCoords ? `${place.lat},${place.lon}` : `${place.title} ${place.city}`;

        const morning = [
            { time: "9:00", text: "Partenza: colazione abbondante e zaino pronto la sera prima." },
            { time: "10:00", text: `Arrivo a ${place.title}. ${place.parentTip || TIPS[kind] || ""}`.trim() },
        ];
        if (age === "0-3 Baby") morning.push({ time: "11:30", text: "Pausa cambio e nanna nel passeggino: cercate una zona tranquilla e all'ombra." });
        else morning.push({ time: "11:30", text: "Spuntino veloce e una sosta ai giochi o al punto panoramico." });

        const lunch = place.picnic
            ? [{ time: "12:30", text: "Pranzo al sacco nelle aree picnic: portate un telo e sacchetti per i rifiuti." }]
            : [{ time: "12:30", text: "Pranzo in zona: scegliete una trattoria con menu bimbi o seggioloni.", link: { label: "Ristoranti per famiglie vicini", url: mapsSearch(`ristoranti per famiglie vicino a ${place.title} ${place.city}`) } }];

        const afternoon = nearby.length
            ? nearby.map((x, i) => ({
                time: i === 0 ? "14:30" : "16:00",
                text: `${i === 0 ? "Seconda tappa" : "Ultima tappa"}: ${x.p.title}${Number.isFinite(x.km) ? ` (${Math.round(x.km * 10) / 10} km, circa ${drive(x.km)})` : ""}.`,
                link: { label: "Apri in Maps", url: mapsSearch(x.p.lat != null ? `${x.p.lat},${x.p.lon}` : `${x.p.title} ${x.p.city}`) },
            }))
            : [{ time: "14:30", text: `Continuate la visita con calma: dopo pranzo i bambini sono più stanchi, alternate attività e pause.` }];
        afternoon.push({ time: "16:30", text: "Merenda e gelato prima del rientro." });
        afternoon.push({ time: "17:30", text: "Rientro a casa: un audiolibro o le canzoni preferite per il viaggio." });

        const info = [
            `Orari: ${place.dateInfo || "verificate sul sito ufficiale prima di partire"}`,
            `Passeggino: ${place.stroller ? "adatto" : "meglio il marsupio"}`,
            `Cani: ${place.dogs ? "ammessi" : "non ammessi o da verificare"}`,
            `Età consigliata: ${age}`,
            place.address ? `Indirizzo: ${place.address}` : null,
        ].filter(Boolean);

        const season = place.season && place.season !== "Tutte" ? place.season : currentSeason();
        const zaino = [...new Set([...(ZAINO_EXTRA[kind] || []), SEASON_EXTRA[season], ...ZAINO_BASE])];

        return {
            sections: [
                { title: "Mattina", items: morning },
                { title: "Pranzo", items: lunch },
                { title: "Pomeriggio", items: afternoon },
                { title: "Info pratiche", items: info.map((text) => ({ text })) },
                { title: "Nello zaino", items: zaino.map((text) => ({ text })) },
            ],
            mapsUrl: mapsSearch(where),
        };
    }

    window.FamilyLive = { scanZone, geocode, buildDayPlan, distanceKm };
})();
