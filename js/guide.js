// guide.js — a tourist guide: floating landmark labels, an info card, road routing with a guidance arrow, and arrival notes.
import * as THREE from 'three';
import { PLACES, geo as geoOf } from './geo.js';
import { F, RC } from './osm.js';
import { esc } from './util.js';

// [key, label height (m), category, importance (1 = must see), description, description in English]
const SPOTS = [
  ['kingdom', 302, 'modern', 1, 'ناطحة سحاب بارتفاع 302 م اكتملت عام 2002، ويعلو قمتها جسر زجاجي معلّق يطل على المدينة.', 'A 302 m skyscraper completed in 2002, crowned by a sky bridge with views over the city.'],
  ['masmak', 22, 'heritage', 2, 'قلعة من الطين بُنيت نحو عام 1865، واسترداد الملك عبدالعزيز لها عام 1902 كان بداية توحيد المملكة.', 'A mud-brick fort built around 1865; its capture by Abdulaziz in 1902 began the unification of the kingdom.'],
  ['turaif', 26, 'heritage', 3, 'عاصمة الدولة السعودية الأولى في الدرعية، ومسجّلة في قائمة التراث العالمي لليونسكو منذ 2010.', 'Capital of the first Saudi state in Diriyah, a UNESCO World Heritage Site since 2010.'],
  ['faisaliah', 267, 'modern', 4, 'أول ناطحة سحاب في المملكة، اكتملت عام 2000 بارتفاع 267 م، وتعلوها كرة زجاجية فيها مطعم.', 'Saudi Arabia\'s first skyscraper, 267 m, completed in 2000, topped by a glass globe with a restaurant.'],
  ['museum', 24, 'culture', 5, 'افتُتح عام 1999 في مركز الملك عبدالعزيز التاريخي بالمربع، ويروي تاريخ الجزيرة العربية والمملكة.', 'Opened in 1999 in the King Abdulaziz Historical Centre; the story of Arabia and the kingdom.'],
  ['kafd', 385, 'modern', 6, 'مركز الملك عبدالله المالي، وفيه برج صندوق الاستثمارات العامة، أعلى مباني الرياض بارتفاع 385 م.', 'The King Abdullah Financial District, home of the 385 m PIF Tower, Riyadh\'s tallest building.'],
  ['zal', 12, 'shop', 7, 'من أقدم أسواق الرياض الشعبية، في الديرة قرب المصمك، يشتهر بالمشالح والسجاد والبخور والعطور، وفيه حراج للأغراض القديمة.', 'One of Riyadh\'s oldest traditional markets, near Masmak, known for bishts, carpets, incense and perfume, with an auction for old goods.'],
  ['murabba', 16, 'heritage', 8, 'قصر من الطين بناه الملك عبدالعزيز أواخر الثلاثينيات خارج أسوار الرياض القديمة، وكان مقراً لحكمه وسكنه، وهو اليوم متحف.', 'A mud-brick palace built by King Abdulaziz in the late 1930s outside the old walls; his home and seat of government, now a museum.'],
  ['hokm', 22, 'heritage', 9, 'مقر الحكم التاريخي في قلب الرياض القديمة، أعيد بناؤه ضمن مشروع تطوير منطقة قصر الحكم، وتحيط به الساحات والأسواق.', 'The historic seat of government in old Riyadh, rebuilt in the Qasr Al-Hokm district project, ringed by squares and markets.'],
  ['turkiMosque', 50, 'faith', 10, 'الجامع الكبير في قلب الرياض بجوار قصر الحكم، من أبرز أمثلة العمارة النجدية الحديثة.', 'The grand mosque at the heart of Riyadh beside Qasr Al-Hokm, a landmark of modern Najdi architecture.'],
  ['ksu', 30, 'edu', 11, 'أول جامعة في المملكة، تأسست عام 1957، وحرمها الرئيسي من أكبر الحرم الجامعية في المنطقة.', 'Saudi Arabia\'s first university, founded in 1957; its main campus is one of the largest in the region.'],
  ['boulevard', 30, 'leisure', 12, 'منطقة ترفيه ومطاعم ومسارح، من أبرز وجهات موسم الرياض، وتضج بالحياة في المساء.', 'An entertainment district of restaurants, theatres and shows, a highlight of Riyadh Season, busiest at night.'],
  ['bujairi', 14, 'food', 13, 'مطاعم ومقاهٍ على ضفة وادي حنيفة في الدرعية، تطل على قصور الطريف.', 'Restaurants and cafés on the bank of Wadi Hanifa in Diriyah, facing the palaces of At-Turaif.'],
  ['rafal', 308, 'modern', 14, 'برج سكني بارتفاع 308 م على طريق الملك فهد شمالاً، اكتمل عام 2014.', 'A 308 m residential tower on King Fahd Road in the north, completed in 2014.'],
  ['tahlia', 14, 'food', 15, 'من أشهر شوارع الرياض للمقاهي والمطاعم والتسوق.', 'One of Riyadh\'s best-known streets for cafés, restaurants and shopping.'],
  ['library', 32, 'culture', 16, 'مكتبة الملك فهد الوطنية، تكسوها أشرعة من القماش مستوحاة من الخيمة العربية.', 'King Fahd National Library, wrapped in fabric sails inspired by the Arabian tent.'],
  ['wadiHanifa', 12, 'leisure', 17, 'وادٍ يشق غرب الرياض وجنوبها، أعيد تأهيله بمتنزهات ومسارات مشي على ضفافه.', 'A valley through west and south Riyadh, restored with parks and walking trails along its banks.'],
  ['thumairi', 14, 'heritage', 18, 'إحدى بوابات سور الرياض القديم، وحولها سوق الثميري للتحف والسجاد والهدايا التقليدية.', 'A gate of old walled Riyadh, with the Thumairi market for antiques, carpets and traditional gifts.'],
  ['water', 64, 'modern', 19, 'برج مياه الرياض بشكله المميز، من معالم السبعينيات قرب حي المربع.', 'The Riyadh Water Tower, a distinctive 1970s landmark near Al Murabba.'],
  ['salam', 14, 'leisure', 20, 'من أكبر الحدائق في وسط الرياض، وفيها بحيرة واسعة.', 'One of the largest parks in central Riyadh, with a wide lake.'],
  ['redPalace', 16, 'heritage', 21, 'قصر بُني في الأربعينيات للأمير سعود بن عبدالعزيز حين كان ولياً للعهد، وسُمّي بلونه الأحمر، ثم صار مقراً حكومياً قبل أن يصبح متحفاً.', 'A palace built in the 1940s for Crown Prince Saud, named for its red colour, later a government seat and now a museum.'],
  ['pnu', 30, 'edu', 22, 'أكبر جامعة للنساء في العالم، بحرم واسع في شمال الرياض يخدمه قطار داخلي خاص.', 'The largest women\'s university in the world, a vast campus in north Riyadh with its own automated train.'],
  ['rajhiMosque', 45, 'faith', 23, 'من أكبر جوامع الرياض، في شرق المدينة.', 'One of the largest mosques in Riyadh, in the east of the city.'],
  ['tv', 172, 'modern', 24, 'برج التلفزيون بارتفاع 170 م، افتُتح عام 1978.', 'The 170 m TV Tower, opened in 1978.'],
  ['blvdWorld', 30, 'leisure', 25, 'منطقة ترفيه تمثل ثقافات العالم بمبانيها وأطعمتها، ضمن موسم الرياض.', 'An entertainment zone with pavilions, food and shows from cultures around the world, part of Riyadh Season.'],
  ['stadium', 50, 'leisure', 26, 'أكبر ملاعب الرياض، بسقفه الأبيض الشبيه بالخيام، افتُتح عام 1987.', 'Riyadh\'s largest stadium, with a white tent-like roof, opened in 1987.'],
  ['moi', 66, 'modern', 27, 'مقر وزارة الداخلية بتصميمه الشبيه بهرم مقلوب، من أبرز المباني المعمارية في الرياض.', 'The Ministry of Interior, shaped like an upside-down pyramid, one of Riyadh\'s most striking buildings.'],
  ['malazPark', 14, 'leisure', 28, 'منتزه كبير في الملز يشتهر بنوافيره الراقصة.', 'A large park in Al Malaz known for its dancing fountains.'],
  ['zoo', 12, 'leisure', 29, 'حديقة حيوان الرياض في حي الملز، مقصد للعائلات.', 'The Riyadh Zoo in Al Malaz, a family favourite.'],
  ['dq', 14, 'leisure', 30, 'حي السفارات غرب الرياض، بحدائقه ومسارات المشي المطلة على وادي حنيفة.', 'The embassy district in west Riyadh, with gardens and trails above Wadi Hanifa.'],
  ['aviation', 16, 'culture', 31, 'متحف للطيران يعرض طائرات حربية ومدنية وتاريخ القوات الجوية السعودية.', 'An aviation museum of military and civil aircraft and the history of the Royal Saudi Air Force.'],
  ['imamU', 30, 'edu', 32, 'من أكبر جامعات المملكة، في شمال الرياض.', 'One of the largest universities in Saudi Arabia, in north Riyadh.'],
  ['riyadhPark', 20, 'shop', 33, 'من أكبر مراكز التسوق في الرياض، فيه متاجر ومطاعم وسينما.', 'One of Riyadh\'s largest malls, with shops, restaurants and a cinema.'],
  ['nakheelMall', 20, 'shop', 34, 'مركز تسوق كبير فيه متاجر ومطاعم وسينما.', 'A large mall with shops, restaurants and a cinema.'],
  ['riyadhGallery', 20, 'shop', 35, 'مركز تسوق على طريق الملك فهد فيه متاجر ومطاعم وسينما.', 'A mall on King Fahd Road with shops, restaurants and a cinema.'],
  ['granada', 20, 'shop', 36, 'مركز تسوق في شرق الرياض فيه متاجر ومطاعم وسينما.', 'A mall in east Riyadh with shops, restaurants and a cinema.'],
  ['roshnFront', 20, 'shop', 37, 'وجهة للتسوق والمطاعم والترفيه في شمال الرياض.', 'A shopping, dining and leisure destination in north Riyadh.'],
  ['panorama', 20, 'shop', 38, 'مركز تسوق معروف في وسط الرياض.', 'A well-known mall in central Riyadh.'],
  ['taiba', 12, 'shop', 39, 'سوق شعبي معروف في شمال وسط الرياض.', 'A well-known traditional market in north-central Riyadh.']
];
export const GUIDE = SPOTS.map(([key, h, cat, rank, desc, descEn]) => ({ key, h, cat, rank, desc, descEn, ...PLACES[key] }));
export const CATS = {
  all: ['الكل', 'All'], heritage: ['تاريخ وتراث', 'Heritage'], modern: ['أبراج ومعمار', 'Skyline'], culture: ['متاحف وثقافة', 'Museums'],
  faith: ['مساجد', 'Mosques'], edu: ['جامعات', 'Universities'], leisure: ['ترفيه وحدائق', 'Leisure'], shop: ['تسوق', 'Shopping'], food: ['مطاعم ومقاهٍ', 'Food & cafés']
};
const POI_KIND = { mall: ['مول', 'shop'], market: ['سوق شعبي', 'shop'], restaurant: ['مطعم', 'food'], fast: ['وجبات سريعة', 'food'], cafe: ['مقهى', 'food'] };

// ---------------------------------------------------------------- finer sorting of food and shopping
// Most places in OpenStreetMap carry no cuisine tag, so the name decides: مندي and كبسة are traditional,
// برجر and البيك are fast food, سوشي is Asian. The first rule that matches wins.
export const SUBS = {
  food: { all: 'الكل', trad: 'شعبية وسعودية', fast: 'وجبات سريعة', asian: 'آسيوية', intl: 'عالمية', sweet: 'حلويات وعصائر', cafe: 'مقاهٍ', other: 'مطاعم أخرى' },
  shop: { all: 'الكل', souq: 'أسواق شعبية', mall: 'مولات', centre: 'مراكز ووجهات حديثة' }
};
const CUISINE = {
  trad: ['regional', 'arab', 'saudi', 'middle_eastern', 'lebanese', 'levantine', 'shawarma', 'kebab', 'turkish', 'moroccan', 'yemeni', 'mandi', 'kabsa', 'hummus', 'falafel', 'syrian', 'egyptian'],
  fast: ['burger', 'chicken', 'sandwich', 'fried_chicken', 'hot_dog', 'friture', 'gourmet_burger', 'wings', 'pizza'],
  asian: ['chinese', 'japanese', 'sushi', 'indian', 'asian', 'thai', 'korean', 'indonesian', 'malabar', 'pakistani', 'vietnamese', 'filipino', 'indian_and_chinese', 'noodle', 'ramen', 'afghan'],
  intl: ['italian', 'american', 'mexican', 'french', 'swiss', 'international', 'steak_house', 'seafood', 'fusion', 'peruvian', 'pasta', 'buffet', 'greek', 'spanish', 'breakfast'],
  sweet: ['dessert', 'donut', 'ice_cream', 'cake', 'pastry', 'bubble_tea', 'juice', 'waffle', 'crepe', 'frozen_yogurt']
};
const NAME = [
  ['sweet', /حلويات|حلا\b|كنافة|كنافه|دونات|آيس ?كريم|ايس ?كريم|جيلاتو|كيك|بسبوسة|عصير|عصائر|وافل|كريب|سينابون|dessert|donut|dunkin|krispy|baskin|gelato|ice ?cream|cake|sweets|juice|waffle|cr[eê]pe|cinnabon/i],
  ['asian', /صيني|ياباني|هندي|سوشي|تايلندي|تايلاندي|كوري|باكستاني|بنغالي|فلبيني|برياني|chinese|japan|sushi|india|thai|korean|asian|\bwok|noodle|ramen|curry|biryani|pakistan|panda|teriyaki/i],
  ['intl', /إيطالي|ايطالي|باستا|ستيك|مكسيكي|فرنسي|steak|italian|pasta|mexican|french|bistro|cheesecake factory|applebee|chili'?s|tgi|olive garden|ihop|seafood|مأكولات بحرية|سمك|أسماك|اسماك/i],
  ['fast', /برجر|برغر|بيتزا|كنتاكي|ماكدونالدز|هرفي|البيك|بروستد|بروست|كودو|هارديز|دومينوز|صب ?واي|بوباي|burger|pizza|kfc|mcdonald|herfy|al ?baik|kudu|hardee|domino|subway|popeyes|chicken|wendy|shake shack|five guys|little caesars|papa john|broa?sted|broast|wings|fries/i],
  ['trad', /مندي|مندى|كبسة|كبسه|مظبي|حنيذ|مضغوط|بخاري|شعبي|مطبخ|مشويات|مشاوي|شاورما|فلافل|فول|معصوب|مطبق|كباب|يمني|لبناني|بيروت|تركي|سوري|شامي|نجدي|سعودي|mandi|kabsa|shawarma|falafel|kebab|lebanese|beirut|turkish|yemeni|saudi|najd|arabic/i]
];
// chains and signature dishes say more than a cuisine tag (Kudu is tagged "regional", Bukhara Alhara "chicken")
const CHAIN = /كودو|هرفي|البيك|كنتاكي|ماكدونالدز|برجر كنج|هارديز|دومينوز|بيتزا هت|صب ?واي|بوباي|\b(kudu|herfy|al ?baik|kfc|mcdonald'?s|burger king|hardee'?s|domino'?s|pizza hut|subway|popeyes|little caesars|papa john'?s|shake shack|five guys|wendy'?s|maestro pizza|texas chicken)\b/i;
const DISH = /مندي|مندى|كبسة|كبسه|مظبي|حنيذ|مضغوط|بخاري|منسف|معصوب|مطبق|جريش|قرصان|مرقوق|\b(mandi|kabsa|bukhar\w*|mathbi|haneeth|mansaf|madfoon)\b/i;
function poiSub(kind, cuisine, ar, en) {
  const name = ar + ' ' + en;
  if (kind === 'market') return 'souq';
  if (kind === 'mall') return /سوق|أسواق|اسواق|حراج|souq|souk/i.test(name) ? 'souq' : /مول|mall/i.test(name) ? 'mall' : 'centre';
  if (kind !== 'cafe' && CHAIN.test(name)) return 'fast';
  if (kind !== 'cafe' && DISH.test(name)) return 'trad';
  const cs = (cuisine || '').toLowerCase().split(';');
  for (const [sub, list] of Object.entries(CUISINE)) if (cs.some((c) => list.includes(c))) return kind === 'cafe' && sub !== 'sweet' ? 'cafe' : sub;
  if (kind === 'cafe') return NAME[0][1].test(name) ? 'sweet' : 'cafe';
  for (const [sub, re] of NAME) if (re.test(name)) return sub;
  return kind === 'fast' ? 'fast' : 'other';
}
// the guide's own shopping and food spots
const SPOT_SUB = { zal: 'souq', taiba: 'souq', roshnFront: 'centre', boulevard: 'centre', bujairi: 'trad', tahlia: 'cafe' };

const DRIVE = new Set([RC.motorway, RC.trunk, RC.primary, RC.secondary, RC.tertiary, RC.unclassified, RC.residential, RC.living, RC.mlink, RC.link]);

// ---------------------------------------------------------------- routing over the road graph (A*)
// Two networks share one graph: cars keep to drivable classes and one-way rules; walkers skip motorways,
// their ramps and road tunnels, may go both ways, and take a trunk road only when nothing else gets there.
const WALK_NO = new Set([RC.motorway, RC.mlink]);
class Router {
  constructor(osm, mode = 'car') {
    this.osm = osm; this.mode = mode;
    const s = osm.s;
    this.ok = !!(s.rNodes && s.rEdges);
    if (!this.ok) return;
    const car = mode === 'car';
    const allowed = (r) => (car ? DRIVE.has(osm.cls(r)) : !WALK_NO.has(osm.cls(r)) && !(osm.flags(r) & F.tunnel));
    this.oneway = (r) => car && !!(osm.flags(r) & F.oneway);
    this.allowed = allowed;
    const N = s.rNodes.length / 2, E = s.rEdges.length / 3;
    this.N = N;
    // CSR adjacency over the allowed edges, both directions unless one-way
    const deg = new Uint32Array(N + 1);
    for (let e = 0; e < E; e++) {
      const u = s.rEdges[e * 3], v = s.rEdges[e * 3 + 1], r = s.rEdges[e * 3 + 2];
      if (!allowed(r)) continue;
      deg[u]++; if (!this.oneway(r)) deg[v]++;
    }
    const off = new Uint32Array(N + 1);
    for (let i = 0; i < N; i++) off[i + 1] = off[i] + deg[i];
    const to = new Uint32Array(off[N]), edge = new Int32Array(off[N]), fill = off.slice(0, N);
    for (let e = 0; e < E; e++) {
      const u = s.rEdges[e * 3], v = s.rEdges[e * 3 + 1], r = s.rEdges[e * 3 + 2];
      if (!allowed(r)) continue;
      to[fill[u]] = v; edge[fill[u]++] = e + 1;                                  // +e: forward along the way
      if (!this.oneway(r)) { to[fill[v]] = u; edge[fill[v]++] = -(e + 1); }      // -e: against it
    }
    Object.assign(this, { off, to, edge });
    // connected pieces of this network: a street on a small island (a path inside a walled district, a stub of
    // two nodes beside a tower) cannot lead anywhere, so routes never start or end on one if there is a choice
    const parent = new Int32Array(N); for (let i = 0; i < N; i++) parent[i] = i;
    const root = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let e = 0; e < E; e++) { const r = s.rEdges[e * 3 + 2]; if (!allowed(r)) continue; const a = root(s.rEdges[e * 3]), b = root(s.rEdges[e * 3 + 1]); if (a !== b) parent[a] = b; }
    const size = new Uint32Array(N); for (let i = 0; i < N; i++) size[root(i)]++;
    this.pieceSize = (node) => size[root(node)];
    // edges of each way, to find where a position sits
    this.byRoad = new Map();
    for (let e = 0; e < E; e++) { const r = s.rEdges[e * 3 + 2]; if (!allowed(r)) continue; let l = this.byRoad.get(r); if (!l) this.byRoad.set(r, (l = [])); l.push(e); }
  }
  // every place a point can join the network: the nearest few streets, each with its edge and distance along the way.
  // A street next to a landmark can be a dead end of two nodes, so one candidate is never enough.
  candidates(x, z, k = 8) {
    const osm = this.osm, s = osm.s, A = s.rAlong, out = [], seen = new Set();
    for (const [R, minPiece] of [[250, 500], [900, 500], [900, 1]]) {
      while (out.length < k) {
        const hit = osm.nearestRoad(x, z, R, (r) => !seen.has(r) && this.byRoad.has(r) && this.pieceSize(s.rEdges[this.byRoad.get(r)[0] * 3]) >= minPiece);
        if (!hit) break;
        seen.add(hit.road);
        for (const e of this.byRoad.get(hit.road)) {
          const a0 = A[e * 2], a1 = A[e * 2 + 1];
          if (hit.along >= Math.min(a0, a1) - 0.5 && hit.along <= Math.max(a0, a1) + 0.5) { out.push({ e, r: hit.road, along: hit.along, x: hit.x, z: hit.z, off: Math.max(0, hit.dist) }); break; }
        }
      }
      if (out.length) break;
    }
    return out;
  }
  edgeLen(e) { const A = this.osm.s.rAlong; return Math.abs(A[e * 2 + 1] - A[e * 2]); }
  route(x0, z0, x1, z1) {
    if (!this.ok) return null;
    const S = this.candidates(x0, z0), T = this.candidates(x1, z1);
    if (!S.length || !T.length) return null;
    const s = this.osm.s, A = s.rAlong, NP = s.rNodes, OFF = 2;   // metres off the road count double
    let best = Infinity, bestN = -1, bestT = null, direct = null;
    // start and goal on the same edge, in a direction the street allows
    for (const a of S) for (const b of T) if (a.e === b.e && (b.along >= a.along || !this.oneway(a.r))) {
      const c = Math.abs(b.along - a.along) + (a.off + b.off) * OFF;
      if (c < best) { best = c; direct = [a, b]; }
    }
    const N = this.N, g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), via = new Int32Array(N), startOf = new Int32Array(N).fill(-1);
    const heap = [], push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const h = (n) => Math.hypot(NP[n * 2] - x1, NP[n * 2 + 1] - z1);
    // every start candidate seeds the search from the ends of its edge (forwards only on one-way streets)
    S.forEach((a, ai) => {
      const ua = s.rEdges[a.e * 3], va = s.rEdges[a.e * 3 + 1], a0 = A[a.e * 2], a1 = A[a.e * 2 + 1];
      const seeds = [[va, Math.abs(a1 - a.along)]];
      if (!this.oneway(a.r)) seeds.push([ua, Math.abs(a.along - a0)]);
      for (const [n, c0] of seeds) { const c = c0 + a.off * OFF; if (c < g[n]) { g[n] = c; from[n] = -2; startOf[n] = ai; push(n, c + h(n)); } }
    });
    // every goal candidate can be reached from the ends of its edge, plus the last piece
    const goal = new Map();
    T.forEach((b) => {
      const ub = s.rEdges[b.e * 3], vb = s.rEdges[b.e * 3 + 1], b0 = A[b.e * 2], b1 = A[b.e * 2 + 1];
      const ends = [[ub, Math.abs(b.along - b0), b0]];
      if (!this.oneway(b.r)) ends.push([vb, Math.abs(b1 - b.along), b1]);
      for (const [n, c0, endAlong] of ends) { const c = c0 + b.off * OFF; if (!goal.has(n) || goal.get(n).c > c) goal.set(n, { c, b, endAlong }); }
    });
    const car = this.mode === 'car';
    let it = 0;
    while (heap.length && it++ < 600000) {
      const [f, n] = pop();
      if (f >= best) break;
      const gl = goal.get(n);
      if (gl && g[n] + gl.c < best) { best = g[n] + gl.c; bestN = n; bestT = gl; direct = null; }
      for (let k = this.off[n]; k < this.off[n + 1]; k++) {
        const m = this.to[k], e = Math.abs(this.edge[k]) - 1;
        // drivers lean towards the big roads; walkers take the shortest way that keeps off trunk roads
        const c = this.osm.cls(s.rEdges[e * 3 + 2]), w = !car ? (c === RC.trunk ? 2.5 : 1) : c <= RC.trunk ? 0.8 : c <= RC.secondary ? 0.9 : 1;
        const ng = g[n] + this.edgeLen(e) * w;
        if (ng < g[m]) { g[m] = ng; from[m] = n; via[m] = this.edge[k]; startOf[m] = startOf[n]; push(m, ng + h(m) * 0.8); }
      }
    }
    if (direct) return { pieces: [[direct[0].r, direct[0].along, direct[1].along]], end: direct[1] };
    if (bestN < 0) return null;
    const pieces = [[bestT.b.r, bestT.endAlong, bestT.b.along]];
    let n = bestN;
    while (from[n] >= 0) {
      const sgn = via[n] > 0 ? 1 : -1, e = Math.abs(via[n]) - 1;
      const r = s.rEdges[e * 3 + 2], e0 = A[e * 2], e1 = A[e * 2 + 1];
      pieces.push(sgn > 0 ? [r, e0, e1] : [r, e1, e0]);
      n = from[n];
    }
    const a = S[startOf[n]], ua = s.rEdges[a.e * 3];
    pieces.push([a.r, a.along, n === ua ? A[a.e * 2] : A[a.e * 2 + 1]]);
    pieces.reverse();
    return { pieces, end: bestT.b };
  }
}

// points of a way between two distances along it (in either direction), with deck/tunnel height
function slice(osm, r, a, b, out) {
  const s = osm.s, st = s.roads[r * 4 + 2], n = s.roads[r * 4 + 3], P = s.roadPts, L = osm.rLen;
  const at = (d) => {
    let i = 0; while (i < n - 2 && L[st + i + 1] < d) i++;
    const l0 = L[st + i], l1 = L[st + i + 1], t = Math.max(0, Math.min(1, (d - l0) / Math.max(1e-6, l1 - l0)));
    return [P[(st + i) * 2] + (P[(st + i + 1) * 2] - P[(st + i) * 2]) * t, P[(st + i) * 2 + 1] + (P[(st + i + 1) * 2 + 1] - P[(st + i) * 2 + 1]) * t, osm.roadY(r, d)];
  };
  const lo = Math.min(a, b), hi = Math.max(a, b), mid = [];
  for (let i = 0; i < n; i++) { const d = L[st + i]; if (d > lo && d < hi) mid.push([P[(st + i) * 2], P[(st + i) * 2 + 1], osm.roadY(r, d)]); }
  if (a > b) mid.reverse();
  out.push(at(a), ...mid, at(b));
}

// ---------------------------------------------------------------- UI
const CSS = `
#guide-labels { position: fixed; inset: 0; pointer-events: none; z-index: 5; overflow: hidden; }
.g-pin { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); pointer-events: auto; cursor: pointer; display: grid; justify-items: center; gap: 2px; border: 0; background: none; padding: 0; color: #fff; font: inherit; will-change: transform; }
.g-pin b { background: rgba(20,16,12,0.72); border: 1px solid rgba(240,200,120,0.55); border-radius: 999px; padding: 3px 10px 4px; font-size: 13px; font-weight: 700; white-space: nowrap; backdrop-filter: blur(6px); }
.g-pin small { font-size: 11.5px; font-weight: 700; color: #f3d79a; text-shadow: 0 1px 2px #000, 0 0 6px #000; }
.g-pin i { width: 2px; height: 18px; background: linear-gradient(#f3d79a, transparent); }
.g-pin.dest b { background: #0d6efd; border-color: #fff; }
#guide-card { position: fixed; z-index: 30; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); width: min(360px, calc(100vw - 32px)); box-sizing: border-box;
  max-height: 86vh; max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); overflow-y: auto; overscroll-behavior: contain; background: rgba(26,21,16,0.94); color: #fbf6ec; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 14px 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.45); backdrop-filter: blur(10px); }
#guide-card h3 { margin: 0; font-size: 19px; } #guide-card .en { font-size: 12.5px; opacity: .75; direction: ltr; text-align: right; }
#guide-card p { margin: 10px 0 12px; font-size: 14px; line-height: 1.7; }
#guide-card .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#guide-card .dist { margin-inline-start: auto; font-size: 12.5px; opacity: .8; }
.g-btn { height: 38px; padding: 0 14px; border-radius: 9px; border: 0; cursor: pointer; font: 600 14px inherit; font-family: inherit; }
.g-go { background: #1f9d63; color: #fff; } .g-tour { width: 100%; margin-top: 10px; height: 44px; font-size: 15px; } .g-own { margin-top: 6px; } .g-alt { background: rgba(255,255,255,0.1); color: #fbf6ec; }
.g-x { position: absolute; top: 8px; left: 8px; width: 32px; height: 32px; border-radius: 8px; border: 0; background: transparent; color: #fbf6ec; font-size: 20px; cursor: pointer; }
#guide-card .g-q { width: 100%; height: 40px; margin-top: 10px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); color: #fbf6ec; font: inherit; font-size: 14px; padding: 0 12px; box-sizing: border-box; }
.g-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
.g-chip { height: 30px; padding: 0 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: transparent; color: #fbf6ec; font: inherit; font-size: 12.5px; cursor: pointer; }
.g-chip[aria-pressed="true"] { background: #f3d79a; color: #2a1d10; border-color: #f3d79a; }
.g-chip small { opacity: .65; font-size: 11px; margin-inline-start: 3px; }
.g-sp { flex: 1; }
.g-nm { display: grid; gap: 1px; min-width: 0; } .g-nm small { opacity: .6; font-size: 11.5px; }
.g-empty { opacity: .7; font-size: 13px; padding: 8px 4px; }
#guide-list { max-height: none; overflow: auto; display: grid; gap: 4px; margin-top: 8px; }
#guide-list button { display: flex; justify-content: space-between; gap: 10px; text-align: right; background: rgba(255,255,255,0.05); color: #fbf6ec; border: 0; border-radius: 8px; padding: 9px 10px; cursor: pointer; font: inherit; font-size: 14px; }
#guide-list span { opacity: .7; font-size: 12px; direction: ltr; }
#guide-nav { position: fixed; z-index: 12; left: 0; right: 0; margin: 0 auto; width: fit-content; box-sizing: border-box; top: calc(env(safe-area-inset-top, 0px) + 84px); display: flex; align-items: center; gap: 10px; background: #0d5ea8; color: #fff; border: 2px solid #fff; border-radius: 12px; padding: 6px 8px 6px 14px; box-shadow: 0 6px 20px rgba(0,0,0,0.35); max-width: calc(100vw - 32px); }
#guide-nav svg { width: 34px; height: 34px; flex: none; transition: transform .15s linear; }
#guide-nav .t { display: grid; line-height: 1.25; min-width: 0; } #guide-nav .t b { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } #guide-nav .t span { font-size: 12px; opacity: .9; }
#guide-nav button { width: 30px; height: 30px; border-radius: 8px; border: 0; background: rgba(255,255,255,0.15); color: #fff; font-size: 16px; cursor: pointer; }
#guide-toast { position: fixed; z-index: 13; left: 0; right: 0; margin: 0 auto; box-sizing: border-box; top: calc(env(safe-area-inset-top, 0px) + 150px); width: min(380px, calc(100vw - 32px)); background: rgba(26,21,16,0.92); color: #fbf6ec; border-radius: 12px; border: 1px solid rgba(243,215,154,0.5); padding: 10px 14px; font-size: 13.5px; line-height: 1.6; box-shadow: 0 8px 26px rgba(0,0,0,0.4); transition: opacity .4s; }
#guide-toast b { color: #f3d79a; display: block; font-size: 15px; }
#guide-toast .g-tail { margin-top: 6px; color: #f3d79a; font-size: 13px; }
#guide-nav .nav-retry { width: auto; padding: 0 10px; font: inherit; font-size: 12.5px; }
@media (pointer: coarse) and (orientation: portrait) { #guide-nav { top: calc(env(safe-area-inset-top, 0px) + 112px); } #guide-toast { top: calc(env(safe-area-inset-top, 0px) + 170px); } #guide-card { right: 12px; left: 12px; width: auto; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); max-height: 86vh; max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); } }
`;
const fmtDist = (m) => (m < 1000 ? Math.round(m / 10) * 10 + ' م' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' كم');

export class Guide {
  constructor({ scene, camera, osm, player, teleport, startTour }) {
    Object.assign(this, { scene, camera, osm, player, teleport, startTour });
    this.router = null;   // built when the routing graph first arrives
    this.route = null; this.dest = null; this.seen = new Map(); this.t = 0;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.layer = document.createElement('div'); this.layer.id = 'guide-labels'; document.body.appendChild(this.layer);
    this.pins = GUIDE.map((g) => {
      const b = document.createElement('button'); b.className = 'g-pin'; b.type = 'button';
      b.innerHTML = `<b>${esc(g.ar)}</b><small></small><i></i>`;
      b.addEventListener('click', () => this.open(g));
      this.layer.appendChild(b);
      return { g, el: b, dist: b.querySelector('small') };
    });
    this.nav = document.createElement('div'); this.nav.id = 'guide-nav'; this.nav.hidden = true;
    this.nav.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 21 12 16.5 4 21Z" fill="#fff"/></svg><div class="t"><b></b><span></span></div><button type="button" aria-label="إلغاء الإرشاد">✕</button>`;
    this.nav.querySelector('button').addEventListener('click', () => { this.plan = null; this.clear(); });
    document.body.appendChild(this.nav);
    this.toast = document.createElement('div'); this.toast.id = 'guide-toast'; this.toast.hidden = true; document.body.appendChild(this.toast);
    this.card = document.createElement('div'); this.card.id = 'guide-card'; this.card.hidden = true; document.body.appendChild(this.card);
    // the route on the road: a glowing ribbon
    this.mat = new THREE.MeshBasicMaterial({ color: '#2fb4ff', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = null;
  }
  // ---- list of all places, nearest first
  // ---- the guide list: search, categories, nearest or most important first; shopping and food add real places from the map
  // null when the file could not be fetched: the list then offers a retry instead of looking empty
  loadPoi() {
    if (this.poi) return Promise.resolve(this.poi);
    this.poiP ??= (async () => {
      try {
        const r = await fetch(this.osm.base + 'riyadh-poi.json');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        this.poi = d.poi.map(([kind, lat, lon, name, en, cuisine]) => {
          const cat = POI_KIND[kind][1], sub = poiSub(kind, cuisine, name, en || '');
          return { key: 'poi', kind, lat, lon, ar: name, en: en || name, cuisine, h: 14, cat, sub, tag: POI_KIND[kind][0] + (sub !== 'other' && SUBS[cat][sub] !== POI_KIND[kind][0] ? ' · ' + SUBS[cat][sub] : ''), ...geoOf(lat, lon) };
        });
        return this.poi;
      } catch (e) { return null; } finally { this.poiP = null; }
    })();
    return this.poiP;
  }
  // the routing graph, fetched once; a failed fetch leaves no router behind, so the next request tries again
  ensureRouter() {
    if (this.router) return Promise.resolve(true);
    this.routerP ??= (async () => {
      try {
        const ok = await this.osm.loadExtra('riyadh-route.bin');
        const r = ok && new Router(this.osm);
        if (r && r.ok) this.router = r;
        return !!this.router;
      } catch (e) { return false; } finally { this.routerP = null; }
    })();
    return this.routerP;
  }
  openList(cat) {
    if (cat) this.cat = cat;
    this.cat = this.cat || 'all'; this.sort = this.sort || 'top'; this.q = this.q || ''; this.sub = this.sub || 'all';
    this.card.innerHTML = `<button class="g-x" type="button" aria-label="إغلاق">✕</button><h3>دليل الرياض</h3><div class="en">Riyadh guide · ${GUIDE.length} معلماً ومئات المطاعم والمتاجر</div>
      <button class="g-btn g-go g-tour" type="button">▶ جولة سياحية تلقائية · Guided tour</button>
      <button class="g-btn g-alt g-tour g-own" type="button">✎ صمّم جولتك بنفسك · Design your tour${this.tourPick?.count() ? ` (${this.tourPick.count()})` : ''}</button>
      <input id="guide-q" class="g-q" type="search" placeholder="ابحث عن معلم أو مطعم أو مول… / Search" value="${this.q.replace(/"/g, '&quot;')}" autocomplete="off">
      <div class="g-chips" role="group" aria-label="الفئات">${Object.entries(CATS).map(([k, [ar]]) => `<button type="button" class="g-chip" data-cat="${k}" aria-pressed="${k === this.cat}">${ar}</button>`).join('')}</div>
      <div class="g-chips g-sub" role="group" aria-label="التصفية"></div>
      <div id="guide-list"></div>`;
    this.card.querySelector('.g-tour').addEventListener('click', () => { this.hideCard(false); this.clear(); this.startTour?.('ready'); });
    this.card.querySelector('.g-own').addEventListener('click', () => { this.hideCard(false); this.clear(); this.startTour?.('custom'); });
    this.card.querySelector('.g-x').addEventListener('click', () => this.hideCard());
    const q = this.card.querySelector('#guide-q');
    q.addEventListener('input', () => { this.q = q.value; this.fillList(); });
    q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.hideCard(); });   // typing must not drive the car
    this.card.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      this.cat = b.dataset.cat; this.sub = 'all';
      this.card.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      this.fillList();
    }));
    this.listExtras?.(this.card);
    this.showCard();
    this.fillList();
  }
  async fillList() {
    const p = this.player.pos, cat = this.cat, q = this.q.trim().toLowerCase();
    const subs = SUBS[cat] || null, counts = this.poi && subs ? this.subCounts(cat) : null;
    const subEl = this.card.querySelector('.g-sub');
    subEl.innerHTML = `${subs ? Object.entries(subs).map(([k, t]) => `<button type="button" class="g-chip" data-sub="${k}" aria-pressed="${k === this.sub}">${t}${counts && k !== 'all' ? ` <small>${counts[k] || 0}</small>` : ''}</button>`).join('') : ''}
      <span class="g-sp"></span><button type="button" class="g-chip" data-sort="top" aria-pressed="${this.sort === 'top'}">الأهم</button><button type="button" class="g-chip" data-sort="near" aria-pressed="${this.sort === 'near'}">الأقرب</button>`;
    subEl.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { this.sub = b.dataset.sub; this.fillList(); }));
    subEl.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { this.sort = b.dataset.sort; this.fillList(); }));
    const list = this.card.querySelector('#guide-list');
    const match = (g) => !q || (g.ar + ' ' + g.en).toLowerCase().includes(q);
    let items = GUIDE.filter((g) => (cat === 'all' || g.cat === cat) && match(g)).map((g) => ({ g, d: Math.hypot(g.x - p.x, g.z - p.z), tag: CATS[g.cat][0] }));
    // real shops and restaurants: for their categories, or when searching
    if (cat === 'shop' || cat === 'food' || (q.length > 1 && cat === 'all')) {
      if (!this.poi) list.innerHTML = '<div class="g-empty">جارٍ تحميل المتاجر والمطاعم…</div>';
      const poi = await this.loadPoi();
      if (this.cat !== cat || this.q.trim().toLowerCase() !== q) return;   // the visitor moved on while it loaded
      if (!poi) {
        list.innerHTML = '<div class="g-empty">تعذّر تحميل المتاجر والمطاعم. تحقق من الاتصال.</div><button type="button" class="g-chip" data-retry>إعادة المحاولة</button>';
        list.querySelector('[data-retry]').addEventListener('click', () => this.fillList());
        return;
      }
      if (!subEl.querySelector('small') && SUBS[cat]) { this.fillList(); return; }   // now the counts are known
      const extra = poi.filter((g) => (cat === 'all' || g.cat === cat) && (this.sub === 'all' || g.sub === this.sub) && match(g))
        .map((g) => ({ g, d: Math.hypot(g.x - p.x, g.z - p.z), tag: g.tag }));
      if (this.sub !== 'all') items = items.filter(({ g }) => this.spotSub(g) === this.sub);
      items = items.concat(extra);
    }
    // "most important": the curated landmarks by rank, then the rest by distance
    items.sort(this.sort === 'near' ? (a, b) => a.d - b.d : (a, b) => (a.g.rank || 999) - (b.g.rank || 999) || a.d - b.d);
    const shown = items.slice(0, 60);
    list.innerHTML = shown.length ? '' : '<div class="g-empty">لا نتائج. جرّب كلمة أخرى أو فئة أخرى.</div>';
    for (const { g, d, tag } of shown) {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<span class="g-nm"><b>${esc(g.ar)}</b><small>${esc(tag)}</small></span><span>${fmtDist(d)}</span>`;
      b.addEventListener('click', () => this.open(g));
      list.appendChild(b);
    }
    if (items.length > shown.length) list.insertAdjacentHTML('beforeend', `<div class="g-empty">و${items.length - shown.length} غيرها؛ ابحث بالاسم أو اختر «الأقرب».</div>`);
  }
  spotSub(g) { return SPOT_SUB[g.key] || (g.cat === 'shop' ? 'mall' : 'other'); }
  subCounts(cat) {
    const n = {};
    for (const g of this.poi) if (g.cat === cat) n[g.sub] = (n[g.sub] || 0) + 1;
    for (const g of GUIDE) if (g.cat === cat) { const k = this.spotSub(g); n[k] = (n[k] || 0) + 1; }
    return n;
  }
  open(g) {
    const p = this.player.pos, d = Math.hypot(g.x - p.x, g.z - p.z);
    this.card.innerHTML = `<button class="g-x" type="button" aria-label="إغلاق">✕</button><h3>${esc(g.ar)}</h3><div class="en">${g.en !== g.ar ? esc(g.en) : ''}</div><p>${esc(g.desc || (g.tag ? g.tag + ' من خريطة OpenStreetMap.' : ''))}</p>
      <div class="row"><button class="g-btn g-go" type="button" data-a="go">خذني إليه</button><button class="g-btn g-alt" type="button" data-a="jump">انتقال فوري</button>${this.tourPick && g.key !== 'poi' ? `<button class="g-btn g-alt" type="button" data-a="pick" aria-pressed="${this.tourPick.has(g.key)}">${this.tourPick.has(g.key) ? '✓ في جولتي' : '＋ أضف إلى جولتي'}</button>` : ''}<span class="dist">على بعد ${fmtDist(d)}</span></div>`;
    this.card.querySelector('.g-x').addEventListener('click', () => this.hideCard());
    this.card.querySelector('[data-a="go"]').addEventListener('click', () => { this.hideCard(); this.plan = null; this.go(g); });
    this.card.querySelector('[data-a="jump"]').addEventListener('click', () => { this.hideCard(); this.clear(); this.teleport(g); });
    const pk = this.card.querySelector('[data-a="pick"]');
    if (pk) pk.addEventListener('click', () => { const on = this.tourPick.toggle(g.key); pk.setAttribute('aria-pressed', on); pk.textContent = on ? '✓ في جولتي' : '＋ أضف إلى جولتي'; });
    this.showCard();
  }
  // the card takes the focus when it opens and gives it back to whatever opened it
  showCard() {
    if (this.card.hidden) this.opener = document.activeElement;
    this.card.hidden = false;
    this.card.setAttribute('role', 'dialog');
    this.card.querySelector('.g-x')?.focus({ preventScroll: true });
  }
  hideCard(restore = true) {
    this.card.hidden = true;
    if (restore && this.opener && document.contains(this.opener)) this.opener.focus({ preventScroll: true });
    this.opener = null;
  }
  // guidance through a chain of stops: on arrival at one, guidance moves on to the next
  goPlan(stops) {
    if (!stops.length) return;
    this.plan = { stops, i: 0 };
    this.go(stops[0]);
  }
  async go(g) {
    this.dest = g; this.route = null; this.build([]);
    this.nav.hidden = false;
    const P = this.plan;
    this.nav.querySelector('b').textContent = 'إلى ' + g.ar + (P && P.stops[P.i] === g ? ` · المحطة ${P.i + 1} من ${P.stops.length}` : '');
    if (!this.router) {
      this.nav.querySelector('span').textContent = 'جارٍ تحميل شبكة الطرق…';
      this.loading = true;
      const ok = await this.ensureRouter();
      this.loading = false;
      if (!ok) {
        this.offline = true;   // guidance falls back to a straight arrow until the visitor retries
        const sp = this.nav.querySelector('span');
        sp.textContent = 'تعذّر تحميل الطرق · ';
        const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'nav-retry'; rb.textContent = 'إعادة المحاولة';
        rb.onclick = () => { rb.remove(); if (this.dest === g) this.go(g); };
        sp.appendChild(rb);
        rb.focus({ preventScroll: true });
        return;
      }
      this.offline = false;
    }
    if (this.dest === g && this.player.mode !== 'heli') this.reroute();
  }
  clear() { this.dest = null; this.route = null; this.offline = false; this.noRoute = false; this.routeMode = null; this.build([]); this.nav.hidden = true; }
  // walkers and drivers get different networks; the walking one is built the first time it is needed
  routerFor(mode) {
    if (!this.router) return null;
    if (mode === 'car') return this.router;
    this.walkRouter ??= new Router(this.osm, 'walk');
    return this.walkRouter;
  }
  reroute() {
    if (!this.router || !this.dest) return;
    const p = this.player.pos, g = this.dest, mode = this.player.mode === 'person' ? 'walk' : 'car';
    const r = this.routerFor(mode).route(p.x, p.z, g.x, g.z);
    this.routeMode = mode;
    this.noRoute = !r;   // the arrow then points straight at the place, and the banner says so
    this.route = null;
    if (r) {
      const pts = [];
      for (const [road, a, b] of r.pieces) slice(this.osm, road, a, b, pts);
      // drop repeats, accumulate distance
      const clean = [], acc = [];
      let d = 0;
      for (const q of pts) { const l = clean[clean.length - 1]; if (l && Math.hypot(q[0] - l[0], q[1] - l[1]) < 0.5) continue; if (l) d += Math.hypot(q[0] - l[0], q[1] - l[1]); clean.push(q); acc.push(d); }
      this.route = { pts: clean, acc, idx: 0 };
    }
    this.build(this.route ? this.route.pts : []);
    this.lastReroute = performance.now();
  }
  build(pts) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (pts.length < 2) return;
    const pos = [], idx = [], hw = 1.4;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const y = pts[i][2] + 0.3;
      pos.push(pts[i][0] + dz * hw, y, pts[i][1] - dx * hw, pts[i][0] - dz * hw, y, pts[i][1] + dx * hw);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.renderOrder = 4; this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  note(title, text, dir = 'rtl', extra = null) {
    this.toast.dir = dir;
    this.toast.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
    if (extra) this.toast.appendChild(extra);
    this.toast.hidden = false; this.toast.style.opacity = 1;
    clearTimeout(this.toastT);
    // longer when it offers choices (the language chips), so there is time to tap one
    this.toastT = setTimeout(() => { this.toast.style.opacity = 0; setTimeout(() => (this.toast.hidden = true), 450); }, extra ? 14000 : 8000);
  }
  // the trip is over: tell the story, stamp the passport, and move on to the next stop of a planned route.
  // `tail` is how far the place still is when the roads end before it
  arrive(g, tail) {
    if (this.near) this.near(g, true); else this.note('وصلت إلى ' + g.ar, g.desc);
    if (tail > 150) this.toast.insertAdjacentHTML('beforeend', `<div class="g-tail">هذه أقرب نقطة على الطريق؛ ${esc(g.ar)} على بعد ${fmtDist(tail)} سيراً</div>`);
    this.seen.set(g.key, performance.now()); this.clear();
    const P = this.plan;
    if (P && P.stops[P.i] === g) {
      P.i++;
      if (P.i < P.stops.length) this.go(P.stops[P.i]);
      else { this.plan = null; setTimeout(() => this.note('انتهى مسارك', `زرت المحطات الـ${P.stops.length} كلها.`), 8500); }
    }
  }
  // drawn on the minimap and the atlas
  drawOn(ctx, toScreen, scale) {
    if (this.route) {
      ctx.save(); ctx.strokeStyle = '#2fb4ff'; ctx.lineWidth = Math.max(3, 6 * scale); ctx.lineJoin = ctx.lineCap = 'round'; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const P = this.route.pts;
      for (let i = this.route.idx; i < P.length; i++) { const s = toScreen(P[i][0], P[i][1]); if (i === this.route.idx) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]); }
      ctx.stroke(); ctx.restore();
    }
    if (this.dest) {
      const s = toScreen(this.dest.x, this.dest.z);
      ctx.fillStyle = '#0d6efd'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  update(dt, hide) {
    const cam = this.camera, p = this.player.pos, W = innerWidth, H = innerHeight;
    const v = new THREE.Vector3();
    // labels: nearest first, never more than six, none behind the camera
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const shown = [];
    for (const pin of this.pins) {
      const g = pin.g, d = Math.hypot(g.x - cam.position.x, g.z - cam.position.z);
      const range = g.h > 150 ? 12000 : g.h > 50 ? 5000 : 2500;
      const isDest = this.dest === g;
      if (hide || (d > range && !isDest) || d < 30) { pin.el.hidden = true; continue; }
      v.set(g.x, Math.min(g.h + 6, cam.position.y + d * 0.6), g.z);
      const ahead = (v.x - cam.position.x) * fwd.x + (v.y - cam.position.y) * fwd.y + (v.z - cam.position.z) * fwd.z;
      v.project(cam);
      if (ahead <= 0 || Math.abs(v.x) > 1.05 || v.y > 1.05 || v.y < -1.05) { pin.el.hidden = true; continue; }
      shown.push({ pin, d, x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, isDest });
    }
    // the destination first, then by distance weighted towards the must-see places
    shown.sort((a, b) => (b.isDest - a.isDest) || a.d * (0.5 + a.pin.g.rank / 20) - b.d * (0.5 + b.pin.g.rank / 20));
    // no two labels on top of each other: lift a label above the ones already placed, or leave it out
    // keep clear of the top bar and the guidance banner
    const top = (document.querySelector('#hud .hud-row')?.getBoundingClientRect().bottom || 60) + 6;
    const boxes = [];
    if (!this.nav.hidden) { const r = this.nav.getBoundingClientRect(); boxes.push({ x: (r.left + r.right) / 2, y: r.bottom + 4, w: r.width + 8, h: r.height + 8 }); }
    shown.forEach((s, i) => {
      const el = s.pin.el;
      const w = s.pin.g.ar.length * 7.5 + 28, h = 44;
      let y = Math.max(top + h, s.y), ok = false;
      // boxes are anchored at their bottom edge
      const hit = (b) => Math.abs(b.x - s.x) < (b.w + w) / 2 && y > b.y - (b.h || h) && y - h < b.y;
      for (let k = 0; k < 4 && !ok; k++) { ok = !boxes.some(hit); if (!ok) y -= h; }
      if (i >= 6 || !ok || y < top + h) { el.hidden = true; return; }
      boxes.push({ x: s.x, y, w, h });
      el.hidden = false;
      el.classList.toggle('dest', s.isDest);
      el.style.transform = `translate(${s.x}px, ${y}px) translate(-50%, -100%)`;
      el.style.opacity = s.isDest ? 1 : Math.max(0.55, 1 - s.d / 14000);
      s.pin.dist.textContent = fmtDist(Math.hypot(s.pin.g.x - p.x, s.pin.g.z - p.z));
    });
    // arriving near a landmark: a short note, once in a while
    this.t += dt;
    if (this.t > 0.5) {
      this.t = 0;
      for (const g of GUIDE) {
        const d = Math.hypot(g.x - p.x, g.z - p.z), near = g.h > 150 ? 500 : 250;
        if (d < near && (!this.seen.has(g.key) || performance.now() - this.seen.get(g.key) > 300000)) {
          this.seen.set(g.key, performance.now());
          if (this.near) this.near(g, false); else this.note(g.ar, g.desc);
        }
      }
    }
    // guidance
    if (!this.dest || this.loading) return;
    const g = this.dest, left = Math.hypot(g.x - p.x, g.z - p.z);
    if (left < (g.h > 150 ? 220 : 140)) { this.arrive(g, 0); return; }
    let tx = g.x, tz = g.z, remain = left;
    const R = this.route, mode = this.player.mode === 'person' ? 'walk' : this.player.mode === 'car' ? 'car' : null;
    if (mode && this.router && this.routeMode && mode !== this.routeMode && performance.now() - this.lastReroute > 1000) { this.reroute(); return; }
    if (R && this.player.mode !== 'heli') {
      // follow progress along the route; reroute when far from it
      let bi = R.idx, bd = Infinity;
      for (let i = Math.max(0, R.idx - 5); i < Math.min(R.pts.length, R.idx + 60); i++) { const q = R.pts[i], dd = (q[0] - p.x) ** 2 + (q[1] - p.z) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      // lost the thread (a teleport, a shortcut): look along the whole route before giving up on it
      if (bd > 45 * 45) for (let i = 0; i < R.pts.length; i++) { const q = R.pts[i], dd = (q[0] - p.x) ** 2 + (q[1] - p.z) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      R.idx = bi;
      if (Math.sqrt(bd) > 45 && performance.now() - this.lastReroute > 2500) { this.reroute(); return; }
      let j = bi; while (j < R.pts.length - 1 && R.acc[j] - R.acc[bi] < 45) j++;
      tx = R.pts[j][0]; tz = R.pts[j][1];
      // the roads stop short of some places (At-Turaif sits on a plateau of lanes 500 m from the nearest street):
      // the distance left counts the last stretch from the route's end, and reaching that end completes the trip
      const end = R.pts[R.pts.length - 1], tail = Math.hypot(g.x - end[0], g.z - end[1]), along = R.acc[R.acc.length - 1] - R.acc[bi];
      remain = along + Math.sqrt(bd) + tail;
      if (along < 25 && Math.hypot(end[0] - p.x, end[1] - p.z) < 35) { this.arrive(g, tail); return; }
    } else if (!R && this.player.mode !== 'heli' && performance.now() - (this.lastReroute || 0) > (this.noRoute ? 8000 : 3000)) { this.reroute(); }
    const camYaw = Math.atan2(-fwd.z, fwd.x), to = Math.atan2(-(tz - p.z), tx - p.x);
    const rel = Math.atan2(Math.sin(camYaw - to), Math.cos(camYaw - to));
    this.nav.querySelector('svg').style.transform = `rotate(${rel * 180 / Math.PI}deg)`;
    const speed = this.player.mode === 'heli' ? 50 : this.player.mode === 'car' ? 14 : 1.4;
    // no time estimate without a real route: a straight line says nothing about the drive
    if (!this.offline) this.nav.querySelector('span').textContent = this.noRoute && this.player.mode !== 'heli'
      ? `${fmtDist(remain)} خط مستقيم · لا يوجد طريق معروف إلى هنا`
      : `${fmtDist(remain)} · نحو ${Math.max(1, Math.round(remain / speed / 60))} د${mode === 'walk' ? ' مشياً' : ''}`;
  }
}
