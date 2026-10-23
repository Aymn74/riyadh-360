# Slop Riyadh · سلوب الرياض

A 3D Riyadh in the browser, built from OpenStreetMap with three.js (WebGL). Inspired by [mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork).

**[▶ افتح الموقع · Open it live](https://aymn74.github.io/slop-riyadh/)**. It works on phones and computers, with no install.

<div dir="rtl">

## بالعربية

مدينة الرياض ثلاثية الأبعاد في المتصفح، مبنية من بيانات الخريطة المفتوحة الحقيقية: شوارعها ومبانيها وحدائقها وأنفاقها وجسورها. تجوّل فيها مشياً، أو بسيارة لاندكروزر، أو بطائرة هليكوبتر، أو دع الجولة السياحية تأخذك.

### الاستكشاف
- **ثلاث طرق للتنقل:** المشي، والقيادة، والطيران، في شوارع الرياض الحقيقية من طريق الملك فهد والعليا إلى الديرة والدرعية.
- **أنفاق وجسور:** الطرق تنزل في الأنفاق وترتفع على الجسور كما في الواقع.
- **أربعة أوقات:** الظهيرة، والمغرب، والليل بإضاءة الشوارع والمباني، والهبوب (عاصفة رملية).
- **حركة مرور** تسير على شبكة الطرق الفعلية وتلتزم بحدود السرعة.
- **على الجوال:** عصا للتوجيه، ودواستا وقود وفرامل، وزر تيربو، وكاميرا مضبوطة للشاشة العمودية.

### دليل الرياض (زر البوصلة)
- **39 معلماً** في ثماني فئات: تاريخ وتراث، أبراج ومعمار، متاحف وثقافة، مساجد، جامعات، ترفيه وحدائق، تسوق، مطاعم ومقاهٍ. من بينها المصمك وسوق الزل وقصر المربع وقصر الحكم وبرج المملكة وجامعة الملك سعود والبوليفارد والطريف.
- **بحث بالاسم وترتيب** حسب الأهمية أو حسب القرب.
- **التسوق والمطاعم:** 1,284 مكاناً بأسمائها من الخريطة المفتوحة: مولات، وأسواق شعبية، ومطاعم، ووجبات سريعة، ومقاهٍ.
- **"خذني إليه":** يرسم مساراً على الطرق الفعلية، مع سهم اتجاه والمسافة والوقت، ويعيد الحساب إذا خرجت عن المسار.
- **بطاقات عائمة** فوق المعالم في المشهد، مع المسافة إليها.

### الجولة السياحية التلقائية
- تطير الكاميرا بين المعالم وتدور حول كل معلم، ويرويه صوتياً راوٍ مع ترجمة مكتوبة.
- **خمسة مواضيع:** شاملة (20 محطة)، تاريخية، الأبراج، عمارة وثقافة، أسواق ومطاعم.
- **ثلاث مدد:** قصيرة، متوسطة، كاملة.
- **ست لغات:** العربية، والإنجليزية، والفرنسية، والإسبانية، والألمانية، والصينية.
- إيقاف مؤقت، والانتقال إلى التالي، وسرعة ×1 و×1.5 و×2.

### الراوي أثناء التجوال (زر السماعة)
يحكي قصة كل معلم تقترب منه، ويذكر اسم الحي حين تدخله، باللغة التي تختارها.

### لوحة السائح (زر الحقيبة)
- وقت الرياض، ومواقيت الصلاة لليوم بطريقة أم القرى، محسوبة على الجهاز دون إنترنت.
- أزرار سريعة: قريب مني، أقرب مسجد، جولة، فاجئني.
- **جواز الرياض:** ختم لكل معلم تزوره.
- **عبارة اليوم:** كلمة عربية مفيدة مع نطقها ومعناها.

</div>

## In English

### Explore
- **Walk, drive a white Land Cruiser, or fly a helicopter** through Riyadh's real streets.
- **Tunnels and bridges** follow the road layers recorded in OpenStreetMap.
- **Four times of day:** noon, maghrib, night with street and building lights, and haboob (a sandstorm).
- **Traffic** follows the real road network and speed limits.
- **On phones:** a steering stick, accelerator and brake pedals, and a camera tuned for portrait screens.

### Riyadh guide (compass button, `G`)
- **39 landmarks** in eight categories, with search and sorting by importance or distance.
- **Shopping and food:** 1,284 named malls, souqs, restaurants, fast-food places and cafés from OpenStreetMap.
- **"Take me there"** draws a route on the real roads, with a direction arrow, distance and time, and reroutes when you leave it.

### Guided tour
- The camera flies from landmark to landmark and circles each one while a narrator tells its story, with subtitles.
- **Five themes:** everything (20 stops), history, skyline, architecture & culture, souqs & food.
- **Three lengths:** short, medium, full.
- **Six languages:** Arabic, English, French, Spanish, German, Chinese.
- **Playback:** pause, skip, and ×1 / ×1.5 / ×2 speed.

### Narrator and tourist panel
- **The narrator (speaker button)** tells each landmark's story as you approach it, and names each district as you enter it.
- **The tourist panel (bag button, `P`)** shows Riyadh time and today's prayer times (Umm al-Qura, computed on the device). It also has buttons for nearby places, the nearest mosque, tours and a surprise, a passport of the landmarks you have visited, and an Arabic phrase of the day.

Narration uses the browser's own speech voices, so the voices available depend on the device. Prayer times can differ by a minute or two from the official calendar.

## Controls

| | Keyboard | Phone |
|---|---|---|
| Move | WASD / arrows | left stick (steering only while driving) |
| Accelerate / brake | W / S | right pedals |
| Boost | Shift | تيربو |
| Jump / climb, descend | Space or E, Q | on-screen buttons |
| Modes | 1 walk · 2 drive · 3 fly | bottom bar |
| Cameras / cockpit | V / C | |
| Map · time of day · hide HUD | M · T · H | top bar |
| Guide · tourist panel · end tour | G · P · Esc | compass · bag |

## Data

Everything comes from OpenStreetMap (© OpenStreetMap contributors, ODbL), extracted with BBBike as a GeoPackage:

```
python3 -I tools/build_osm.py riyadh.gpkg data/   # roads, buildings, land, rail, infill, routing graph
python3 -I tools/build_poi.py riyadh.gpkg data/   # named shops, souqs, restaurants and cafés
for f in data/*.bin; do base64 -w 0 "$f" > "${f%.bin}.b64.txt"; done   # the page loads the base64 text files
```

- 92,656 road ways with names, lanes, one-way, speed limits, and the vertical profile of bridges and tunnels.
- 89,040 building footprints. Few have heights in OSM, so heights are estimated from type, size and location.
- 412,300 generated villa, shop and apartment plots, placed only along real residential streets on free land.
- A routing graph of 151,614 junctions and 226,991 road pieces. It is loaded only when a route is first asked for.
- 1,284 named places for shopping and food, and 1,250 mosques.
- Kingdom Centre, Al Faisaliah, PIF Tower, Burj Rafal, Masmak, the Water Tower, the TV Tower, the Ministry of
  Interior and At-Turaif are hand-built models at their OSM positions.

## Files

- `js/main.js`: renderer, time-of-day presets, cameras, HUD, minimap and atlas, touch controls
- `js/osm.js`: loads the OSM data, spatial grids, nearest-road queries, bridge and tunnel heights
- `js/world.js`: builds the city in 1 km chunks: roads, bridges, tunnels, buildings, land use, infill, lamps, palms
- `js/player.js`: walking, the Land Cruiser model and driving, the helicopter
- `js/cars.js`, `js/traffic.js`: traffic on the real road network
- `js/guide.js`: landmark list, categories and search, shopping and food, routing and guidance
- `js/tour.js`: the guided tour, its narration in six languages, and the narrator
- `js/tourist.js`: the tourist panel and prayer times
- `js/materials.js`: facade shader with night lights, roads, ground, sky, palms
- `js/landmarks.js`, `js/geo.js`, `js/city.js`: hand-built landmarks, coordinates and places, instancing helpers
- `tools/`: the Python scripts that turn the GeoPackage into the files in `data/`

To run it locally, serve the folder with any static server (for example `npx serve .`) and open `index.html`.
