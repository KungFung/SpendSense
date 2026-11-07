// keywords.js — THE LIST TO EDIT when a shop is classified wrongly.
//
// Each group has:
//   label:    "need", "want" or "unsure" (unsure = the shop sells both, e.g. Amazon)
//   group:    a short name shown to the user in the reason ("groceries", "takeaway"...)
//   keywords: words to look for in the bank description. Write them however you like
//             ("McDonald's", "MCDONALDS", "mcdonalds" all work — case and punctuation are ignored).
//
// How matching works (see classifier.js): a keyword matches if a WORD in the description
// STARTS with it. So "TESCO" matches "TESCO STORES 3297", and "SAINSBURY" matches
// "SAINSBURYS S/MKTS", but "EE" (the phone network) does NOT match "COSTA COFFEE".
// If two keywords match, the longer one wins, so "UBER EATS" beats "UBER".
//
// To add a shop: put its name in the right list. That's it.

const KEYWORD_RULES = [
  // ---------- NEEDS: essentials ----------
  { label: "need", group: "rent/housing", keywords: ["RENT", "MORTGAGE", "LETTINGS"] },
  { label: "need", group: "council tax", keywords: ["COUNCIL TAX", "COUNCIL", "CITY COUN"] },
  {
    label: "need",
    group: "groceries",
    keywords: ["TESCO", "ALDI", "LIDL", "SAINSBURY", "ASDA", "MORRISONS", "CO-OP", "COOP", "WAITROSE", "ICELAND", "M&S SIMPLY FOOD"],
  },
  {
    label: "need",
    group: "utilities/bills",
    keywords: ["OCTOPUS ENERGY", "BRITISH GAS", "EDF", "E.ON", "OVO", "THAMES WATER", "YORKSHIRE WATER", "SCOTTISH WATER", "TV LICENCE"],
  },
  { label: "need", group: "phone/internet", keywords: ["EE LIMITED", "VODAFONE", "O2", "THREE", "BT GROUP", "VIRGIN MEDIA", "SKY BROADBAND"] },
  {
    label: "need",
    group: "transport",
    keywords: ["TRAINLINE", "SCOTRAIL", "NORTHERN RAIL", "LNER", "AVANTI", "TFL", "FIRST BUS", "STAGECOACH", "ARRIVA"],
  },
  { label: "need", group: "fuel", keywords: ["SHELL", "BP", "ESSO", "TEXACO", "PETROL"] },
  { label: "need", group: "insurance", keywords: ["ADMIRAL", "AVIVA", "DIRECT LINE", "LV=", "AXA", "INSURANCE"] },
  { label: "need", group: "health", keywords: ["PHARMACY", "NHS", "DENTAL", "OPTICIAN"] },

  // ---------- WANTS: nice-to-haves ----------
  {
    label: "want",
    group: "fast food/takeaway",
    keywords: ["MCDONALDS", "MCDONALD'S", "BURGER KING", "KFC", "DELIVEROO", "JUST EAT", "UBER EATS", "DOMINOS", "PIZZA HUT", "GREGGS", "NANDOS", "FIVE GUYS"],
  },
  { label: "want", group: "coffee/eating out", keywords: ["COSTA", "STARBUCKS", "PRET", "CAFFE NERO", "WETHERSPOON", "WAGAMAMA"] },
  { label: "want", group: "fashion", keywords: ["ASOS", "PRIMARK", "H&M", "ZARA", "TK MAXX", "SHEIN", "BOOHOO", "JD SPORTS", "NEXT RETAIL"] },
  { label: "want", group: "gaming", keywords: ["STEAM", "PLAYSTATION", "XBOX", "NINTENDO", "EPIC GAMES"] },
  {
    label: "want",
    group: "subscriptions/entertainment",
    keywords: ["NETFLIX", "SPOTIFY", "DISNEY PLUS", "DISNEY+", "NOW TV", "PRIME VIDEO", "CINEWORLD", "ODEON", "TICKETMASTER"],
  },
  { label: "want", group: "gym/fitness", keywords: ["PUREGYM", "THE GYM", "GYM GROUP", "DAVID LLOYD"] },

  // ---------- UNSURE: shops that sell both needs and wants ----------
  // These go to "unsure" (and to Gemini, if it's switched on).
  { label: "unsure", group: "mixed shop", keywords: ["AMAZON", "AMZN", "PAYPAL", "EBAY", "BOOTS", "SUPERDRUG", "WHSMITH", "ARGOS", "CURRYS"] },
  { label: "unsure", group: "taxi/ride", keywords: ["UBER", "BOLT"] }, // could be a late-night lift home (need) or laziness (want)
  { label: "unsure", group: "cash withdrawal", keywords: ["LNK", "CASH", "ATM"] }, // we can't see what cash was spent on
];

// If the transaction already has a category (from the CSV parser), we map it here.
// Keys are lower case. Only used when no need/want keyword matched.
const CATEGORY_RULES = {
  rent: "need",
  housing: "need",
  mortgage: "need",
  bills: "need",
  utilities: "need",
  groceries: "need",
  transport: "need",
  fuel: "need",
  insurance: "need",
  health: "need",
  "council tax": "need",
  eating_out: "want",
  "eating out": "want",
  takeaway: "want",
  "fast food": "want",
  entertainment: "want",
  shopping: "want",
  clothes: "want",
  fashion: "want",
  gaming: "want",
  subscriptions: "want",
};

module.exports = { KEYWORD_RULES, CATEGORY_RULES };
