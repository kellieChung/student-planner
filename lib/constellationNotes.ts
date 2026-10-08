// Where each constellation sits on the sky and its field note (one real
// fact, revealed once it's fully charted). Kept apart from the star data so
// the frozen catalog entries never need editing. ra = right ascension of
// the approximate centre in hours, dec = declination in degrees, span =
// rough width in degrees (Galaxy view scale). Approximate by design.
export type ConstellationNote = {
    ra: number;
    dec: number;
    span: number;
    fact: string;
};

export const CONSTELLATION_NOTES: Record<string, ConstellationNote> = {
    // Home sky
    "orion": { ra: 5.6, dec: 3, span: 25, fact: "Orion's Belt (Alnitak, Alnilam and Mintaka) points down toward Sirius, the brightest star in the night sky." },
    "ursa-major": { ra: 12.3, dec: 55, span: 26, fact: "Dubhe and Merak, the two stars at the end of the Big Dipper's bowl, point almost straight at Polaris." },
    "cassiopeia": { ra: 1.0, dec: 61, span: 20, fact: "Cassiopeia's W sits on the opposite side of Polaris from the Big Dipper, so one is well placed when the other is low." },
    "ursa-minor": { ra: 14.8, dec: 76, span: 16, fact: "Polaris sits less than one degree from the north celestial pole, so it barely moves all night." },
    "cygnus": { ra: 20.6, dec: 42, span: 28, fact: "Albireo, the swan's beak, looks like one star to the eye but splits into a gold and a blue star in a small telescope." },
    "lyra": { ra: 18.8, dec: 36, span: 10, fact: "Vega was the pole star around 12,000 BCE and will be again in roughly 12,000 years, thanks to the slow wobble of Earth's axis." },
    "scorpius": { ra: 16.9, dec: -30, span: 28, fact: "Antares means \"rival of Mars\", a name earned by its deep red colour." },
    "leo": { ra: 10.7, dec: 16, span: 28, fact: "Regulus sits almost exactly on the ecliptic, so the Moon regularly passes in front of it." },
    "gemini": { ra: 7.1, dec: 23, span: 20, fact: "Castor looks like a single star but is a system of six stars bound together." },
    "taurus": { ra: 4.6, dec: 18, span: 28, fact: "The Pleiades, on the bull's shoulder, is a young star cluster that most people can see as six or seven stars by eye." },
    "pegasus": { ra: 22.8, dec: 20, span: 32, fact: "The Great Square of Pegasus shares one corner star, Alpheratz, with Andromeda." },
    "andromeda": { ra: 0.9, dec: 36, span: 28, fact: "The Andromeda Galaxy, about 2.5 million light-years away, is the most distant thing most people can see without a telescope." },
    "aquila": { ra: 19.7, dec: 5, span: 22, fact: "Altair spins about once every nine hours, so fast that it bulges noticeably at its equator." },
    "draco": { ra: 16.5, dec: 62, span: 45, fact: "Thuban, in Draco's tail, was the north star when the Egyptian pyramids were built." },
    "crux": { ra: 12.4, dec: -60, span: 8, fact: "Crux is the smallest of the 88 constellations, yet it appears on the flags of Australia, New Zealand, Brazil, Papua New Guinea and Samoa." },

    // The Southern Sky
    "canis-major": { ra: 6.8, dec: -22, span: 18, fact: "Sirius, the Dog Star, is the brightest star in the night sky and lies only about 8.6 light-years away." },
    "sagittarius": { ra: 19.0, dec: -28, span: 28, fact: "The centre of the Milky Way lies in the direction of the Teapot's spout." },
    "centaurus": { ra: 13.1, dec: -47, span: 40, fact: "Alpha Centauri is the closest star system to the Sun, about 4.4 light-years away." },
    "carina": { ra: 8.7, dec: -62, span: 30, fact: "Canopus is the second-brightest star in the night sky, and spacecraft have used it as a navigation reference." },
    "vela": { ra: 9.6, dec: -47, span: 22, fact: "Vela, Carina and Puppis were once one giant constellation, Argo Navis, the ship of Jason and the Argonauts." },
    "lupus": { ra: 15.2, dec: -43, span: 16, fact: "Lupus held SN 1006, the brightest supernova ever recorded, which outshone Venus." },
    "corona-australis": { ra: 19.2, dec: -41, span: 10, fact: "Corona Australis is one of Ptolemy's original 48 constellations, though it sits low or below the horizon for much of the north." },
    "grus": { ra: 22.5, dec: -46, span: 16, fact: "Grus was one of twelve constellations drawn from the observations of Dutch navigators in the late 1500s." },
    "pavo": { ra: 19.6, dec: -65, span: 18, fact: "Its brightest star, Peacock, was named for the Royal Air Force's navigation almanac in the 1930s." },
    "phoenix": { ra: 0.9, dec: -48, span: 20, fact: "Phoenix contains the Phoenix Cluster, one of the most massive galaxy clusters known." },
    "triangulum-australe": { ra: 16.1, dec: -65, span: 10, fact: "Its three bright stars make it easier to spot than its fainter northern namesake, Triangulum." },
    "tucana": { ra: 23.8, dec: -65, span: 15, fact: "Tucana holds the Small Magellanic Cloud, a dwarf galaxy that orbits our own." },

    // The Zodiac
    "virgo": { ra: 13.4, dec: -2, span: 32, fact: "Virgo is the largest zodiac constellation and the second-largest of all 88." },
    "aquarius": { ra: 22.3, dec: -11, span: 32, fact: "The Eta Aquariid meteor shower, made of debris from Halley's Comet, seems to stream out of Aquarius every May." },
    "capricornus": { ra: 21.0, dec: -18, span: 22, fact: "The Tropic of Capricorn is named for it: the Sun was in Capricornus at the December solstice when the name was coined." },
    "aries": { ra: 2.6, dec: 21, span: 16, fact: "About 2,000 years ago the Sun crossed into Aries at the March equinox, which is why that point is still called the First Point of Aries." },
    "pisces": { ra: 0.6, dec: 12, span: 34, fact: "The Sun now stands in Pisces at the March equinox, after the equinox point drifted out of Aries over two thousand years." },
    "cancer": { ra: 8.6, dec: 20, span: 16, fact: "Cancer holds the Beehive Cluster, a swarm of stars that looks like a faint smudge to the eye on dark nights." },
    "libra": { ra: 15.2, dec: -15, span: 18, fact: "Libra's brightest stars have Arabic names meaning the southern and northern claw, from when they belonged to Scorpius." },
    "ophiuchus": { ra: 17.3, dec: -6, span: 32, fact: "The Sun passes through Ophiuchus every December, making it the unofficial thirteenth constellation of the zodiac." },

    // Heroes & Legends
    "perseus": { ra: 3.2, dec: 45, span: 26, fact: "Algol, the Demon Star, dims noticeably every 2.87 days when its companion passes in front of it." },
    "hercules": { ra: 17.3, dec: 27, span: 32, fact: "The Great Globular Cluster in Hercules holds several hundred thousand stars, and the 1974 Arecibo message was beamed toward it." },
    "bootes": { ra: 14.7, dec: 31, span: 28, fact: "Arcturus is the brightest star in the northern half of the sky." },
    "auriga": { ra: 5.9, dec: 42, span: 24, fact: "Capella is really two yellow giant stars orbiting each other, which look like one bright star." },
    "cepheus": { ra: 22.0, dec: 70, span: 26, fact: "Delta Cephei gave its name to Cepheid variables, pulsing stars whose rhythm reveals their true distance." },
    "cetus": { ra: 1.7, dec: -7, span: 40, fact: "Mira swells and fades over about 11 months, at times easy to see and at times invisible to the eye." },
    "corona-borealis": { ra: 15.8, dec: 30, span: 10, fact: "T Coronae Borealis, a recurring nova in this small crown, flares from invisible to naked-eye bright roughly every 80 years." },
    "serpens": { ra: 16.6, dec: 6, span: 38, fact: "Serpens is the only constellation split in two, with its head and tail on either side of Ophiuchus." },

    // The Long River
    "canis-minor": { ra: 7.6, dec: 6, span: 8, fact: "Procyon means \"before the dog\": for northern observers it rises just before Sirius." },
    "lepus": { ra: 5.6, dec: -19, span: 15, fact: "Lepus, the hare, crouches at Orion's feet, chased by his hunting dogs." },
    "eridanus": { ra: 3.3, dec: -29, span: 45, fact: "Eridanus is the sixth-largest constellation, winding from near Orion's foot to Achernar far in the south." },
    "hydra": { ra: 11.6, dec: -14, span: 70, fact: "Hydra is the largest of the 88 constellations, stretching more than 100 degrees across the sky." },
    "corvus": { ra: 12.4, dec: -18, span: 9, fact: "In Greek myth Apollo set the crow in the sky beside the cup and the water snake as punishment for lying to him." },
    "monoceros": { ra: 7.1, dec: -3, span: 20, fact: "Monoceros holds the Rosette Nebula, a flower-shaped cloud of glowing gas where new stars are forming." },
    "puppis": { ra: 7.3, dec: -32, span: 22, fact: "Puppis, the ship's stern, was carved out of the old constellation Argo Navis in the 1750s." },
    "columba": { ra: 5.9, dec: -35, span: 13, fact: "Columba is usually said to be the dove Noah released from the ark." },
    "crater": { ra: 11.4, dec: -16, span: 12, fact: "Crater is the cup of Apollo, carried by the crow in the same Greek myth as Corvus." },
    "sextans": { ra: 10.3, dec: -2, span: 11, fact: "Johannes Hevelius named Sextans after the instrument he used to measure star positions, lost in a fire in 1679." },

    // The Deep South
    "piscis-austrinus": { ra: 22.3, dec: -31, span: 14, fact: "Fomalhaut, the southern fish's mouth, is circled by a wide ring of dust photographed by Hubble and Webb." },
    "dorado": { ra: 5.2, dec: -60, span: 16, fact: "Dorado contains most of the Large Magellanic Cloud, where Supernova 1987A became the closest supernova seen since 1604." },
    "musca": { ra: 12.6, dec: -70, span: 10, fact: "Musca, the fly, is the only insect among the 88 constellations." },
    "ara": { ra: 17.4, dec: -55, span: 14, fact: "In Greek myth Ara is the altar where the gods swore loyalty before their war against the Titans." },
    // unsure: "between" is loose; Hydrus sits beside both Magellanic Clouds.
    "hydrus": { ra: 2.3, dec: -70, span: 16, fact: "Hydrus, the male water snake, coils between the Large and Small Magellanic Clouds." },
    "indus": { ra: 21.9, dec: -58, span: 16, fact: "Epsilon Indi, about 12 light-years away, is one of the Sun's closest neighbours and has a giant planet and two brown dwarfs." },
    "apus": { ra: 16.1, dec: -75, span: 14, fact: "Apus, the bird of paradise, sits so far south that it never rises for most of the Northern Hemisphere." },
    // unsure: the flying-fish origin story is traditional, not documented.
    "volans": { ra: 7.8, dec: -69, span: 10, fact: "Volans is a flying fish, a sight Dutch sailors met on their voyages to the East Indies." },
    "scutum": { ra: 18.7, dec: -10, span: 6, fact: "Scutum is one of only two constellations honouring a real person: it is the shield of the Polish king John III Sobieski." },
    "chamaeleon": { ra: 10.7, dec: -79, span: 12, fact: "Chamaeleon lies near the south celestial pole and has no star brighter than fourth magnitude." },

    // Small Wonders
    "delphinus": { ra: 20.7, dec: 12, span: 7, fact: "Its stars Sualocin and Rotanev spell \"Nicolaus Venator\" backwards, the Latinised name of an astronomer's assistant." },
    "triangulum": { ra: 2.2, dec: 32, span: 8, fact: "The Triangulum Galaxy, about 3 million light-years away, is the third-largest galaxy in our Local Group." },
    "coma-berenices": { ra: 12.8, dec: 23, span: 14, fact: "It is named for the hair of the Egyptian queen Berenice II, who offered it to the gods for her husband's safe return." },
    "canes-venatici": { ra: 13.1, dec: 40, span: 14, fact: "The Whirlpool Galaxy in Canes Venatici was the first galaxy recognised as a spiral, in 1845." },
    "sagitta": { ra: 19.7, dec: 18, span: 6, fact: "Sagitta, the arrow, is the third-smallest constellation." },
    "lacerta": { ra: 22.5, dec: 46, span: 10, fact: "Lacerta gives its name to BL Lacertae objects, active galaxies first mistaken for a variable star." },
    "vulpecula": { ra: 20.2, dec: 24, span: 12, fact: "The first pulsar ever discovered, in 1967, lies in Vulpecula." },
    "equuleus": { ra: 21.2, dec: 8, span: 5, fact: "Equuleus, the little horse, is the second-smallest constellation after Crux." },
    "leo-minor": { ra: 10.2, dec: 33, span: 12, fact: "Leo Minor has a star lettered beta but no alpha, a slip by the astronomer who lettered it." },
    "lynx": { ra: 7.9, dec: 47, span: 28, fact: "Hevelius named it Lynx because you'd need the eyes of a lynx to see its faint stars." },
    "camelopardalis": { ra: 6.0, dec: 70, span: 32, fact: "Camelopardalis, the giraffe, is large but faint: its brightest star is only fourth magnitude." },

    // Instruments of Science
    "pyxis": { ra: 8.9, dec: -27, span: 9, fact: "Pyxis, the mariner's compass, sits beside the old ship Argo Navis it was drawn to steer." },
    "octans": { ra: 22.0, dec: -82, span: 14, fact: "Octans contains the south celestial pole, but its pole star, Polaris Australis, is barely visible to the eye." },
    "telescopium": { ra: 19.3, dec: -51, span: 11, fact: "Telescopium is one of the constellations Lacaille named in the 1750s after tools of science and art." },
    "horologium": { ra: 3.3, dec: -52, span: 18, fact: "Horologium is a pendulum clock, the instrument astronomers used to time their observations." },
    "circinus": { ra: 14.6, dec: -63, span: 8, fact: "Circinus is a drafting compass, set beside the carpenter's square Norma." },
    "norma": { ra: 15.9, dec: -51, span: 9, fact: "Norma once had stars lettered alpha and beta, which were later moved into neighbouring constellations." },
    "microscopium": { ra: 21.0, dec: -36, span: 10, fact: "Microscopium honours the compound microscope; none of its stars is brighter than fourth magnitude." },
    "reticulum": { ra: 3.9, dec: -60, span: 7, fact: "Reticulum honours the crosshair grid Lacaille used in his telescope to measure star positions." },
    "fornax": { ra: 2.8, dec: -32, span: 18, fact: "The Hubble Ultra Deep Field, showing about 10,000 galaxies in a tiny patch of sky, was taken in Fornax." },
    "sculptor": { ra: 0.4, dec: -32, span: 18, fact: "Sculptor holds the south galactic pole, where we look straight out of the Milky Way's disk." },
    "pictor": { ra: 5.7, dec: -53, span: 13, fact: "Beta Pictoris was the first star seen with a disk of dust where planets form, photographed in 1984." },
    "antlia": { ra: 10.3, dec: -32, span: 13, fact: "Antlia honours the air pump, named in the 1750s by Nicolas-Louis de Lacaille." },
    "caelum": { ra: 4.7, dec: -38, span: 9, fact: "Caelum, the chisel, is one of the faintest constellations, with no star brighter than fourth magnitude." },
    "mensa": { ra: 5.4, dec: -77, span: 11, fact: "Mensa is the only constellation named after a real landmark, Table Mountain in South Africa, where Lacaille observed." },
};
