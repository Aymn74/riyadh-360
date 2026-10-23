// tour.js — an automatic sightseeing tour: the camera flies from landmark to landmark, circles each one,
// and a narrator (the browser's own speech voices) tells its story in the chosen language, with subtitles.
import * as THREE from 'three';
import { PLACES } from './geo.js';

export const LANGS = [
  { id: 'ar', name: 'العربية', bcp: 'ar-SA', dir: 'rtl' },
  { id: 'en', name: 'English', bcp: 'en-US', dir: 'ltr' },
  { id: 'fr', name: 'Français', bcp: 'fr-FR', dir: 'ltr' },
  { id: 'es', name: 'Español', bcp: 'es-ES', dir: 'ltr' },
  { id: 'de', name: 'Deutsch', bcp: 'de-DE', dir: 'ltr' },
  { id: 'zh', name: '中文', bcp: 'zh-CN', dir: 'ltr' }
];

const UI = {
  ar: { title: 'جولة الرياض', start: 'ابدأ الجولة', end: 'إنهاء', next: 'التالي', pause: 'إيقاف مؤقت', play: 'متابعة', mute: 'كتم الصوت', unmute: 'تشغيل الصوت', noVoice: 'لا يتوفر صوت لهذه اللغة على جهازك، ستظهر الترجمة فقط.', lang: 'اللغة' },
  en: { title: 'Riyadh tour', start: 'Start the tour', end: 'End', next: 'Next', pause: 'Pause', play: 'Resume', mute: 'Mute', unmute: 'Sound on', noVoice: 'No voice for this language on your device; subtitles only.', lang: 'Language' },
  fr: { title: 'Visite de Riyad', start: 'Commencer la visite', end: 'Terminer', next: 'Suivant', pause: 'Pause', play: 'Reprendre', mute: 'Couper le son', unmute: 'Activer le son', noVoice: 'Aucune voix pour cette langue sur votre appareil ; sous-titres seulement.', lang: 'Langue' },
  es: { title: 'Recorrido por Riad', start: 'Empezar el recorrido', end: 'Terminar', next: 'Siguiente', pause: 'Pausa', play: 'Continuar', mute: 'Silenciar', unmute: 'Activar sonido', noVoice: 'No hay voz para este idioma en su dispositivo; solo subtítulos.', lang: 'Idioma' },
  de: { title: 'Riad-Rundgang', start: 'Rundgang starten', end: 'Beenden', next: 'Weiter', pause: 'Pause', play: 'Fortsetzen', mute: 'Ton aus', unmute: 'Ton an', noVoice: 'Keine Stimme für diese Sprache auf Ihrem Gerät; nur Untertitel.', lang: 'Sprache' },
  zh: { title: '利雅得之旅', start: '开始游览', end: '结束', next: '下一站', pause: '暂停', play: '继续', mute: '静音', unmute: '打开声音', noVoice: '您的设备没有该语言的语音，仅显示字幕。', lang: '语言' }
};

const INTRO = {
  ar: 'أهلاً بكم في الرياض، عاصمة المملكة العربية السعودية. نبدأ جولتنا من قلب المدينة القديمة، ثم نتجه شمالاً عبر أبراجها الحديثة، ونختم في الدرعية حيث بدأت القصة.',
  en: 'Welcome to Riyadh, the capital of Saudi Arabia. We begin in the heart of the old town, head north past its modern towers, and finish in Diriyah, where the story began.',
  fr: 'Bienvenue à Riyad, capitale de l\'Arabie saoudite. Nous commençons au cœur de la vieille ville, remontons vers le nord parmi les tours modernes, et terminons à Diriyah, là où tout a commencé.',
  es: 'Bienvenidos a Riad, la capital de Arabia Saudí. Empezamos en el corazón de la ciudad antigua, subimos hacia el norte entre sus torres modernas y terminamos en Diriyah, donde comenzó la historia.',
  de: 'Willkommen in Riad, der Hauptstadt Saudi-Arabiens. Wir beginnen im Herzen der Altstadt, fahren nach Norden an den modernen Türmen vorbei und enden in Diriyah, wo alles begann.',
  zh: '欢迎来到沙特阿拉伯首都利雅得。我们从老城中心出发，向北穿过现代高楼，最后抵达故事开始的地方——德拉伊耶。'
};
const NEXT = { ar: 'التالي: ', en: 'Next: ', fr: 'Prochain arrêt : ', es: 'Siguiente parada: ', de: 'Nächster Halt: ', zh: '下一站：' };
const OUTRO = {
  ar: 'انتهت جولتنا في الرياض. يمكنك الآن التجول بحرية، أو فتح الدليل لزيارة أي معلم من جديد.',
  en: 'That is the end of our tour of Riyadh. Explore freely now, or open the guide to visit any landmark again.',
  fr: 'Notre visite de Riyad est terminée. Explorez librement, ou ouvrez le guide pour revoir un lieu.',
  es: 'Aquí termina nuestro recorrido por Riad. Explore libremente o abra la guía para volver a cualquier lugar.',
  de: 'Damit endet unser Rundgang durch Riad. Erkunden Sie die Stadt frei oder öffnen Sie den Führer, um einen Ort erneut zu besuchen.',
  zh: '利雅得之旅到此结束。您可以自由探索，或打开导览再次前往任何地标。'
};

// stops in travelling order: [place key, height to frame (m), narration per language]
const STOPS = [
  ['masmak', 22, {
    ar: 'قصر المصمك، قلعة من الطين واللبن بُنيت نحو عام 1865 في حي الديرة. في عام 1902 استعاد الملك عبدالعزيز آل سعود الرياض انطلاقاً من هذه القلعة، فكانت بداية تأسيس المملكة الحديثة. وهو اليوم متحف.',
    en: 'Masmak Fortress, built of clay and mud brick around 1865 in the old Dirah quarter. In 1902 Abdulaziz Al Saud took Riyadh back from this fort, the first step towards the modern kingdom. Today it is a museum.',
    fr: 'Le fort de Masmak, bâti en argile et en briques crues vers 1865 dans le vieux quartier de Dirah. En 1902, Abdelaziz Al Saoud reprit Riyad à partir de ce fort, premier pas vers le royaume moderne. C\'est aujourd\'hui un musée.',
    es: 'La fortaleza de Masmak, construida en arcilla y adobe hacia 1865 en el antiguo barrio de Dirah. En 1902 Abdulaziz Al Saud recuperó Riad desde este fuerte, el primer paso hacia el reino moderno. Hoy es un museo.',
    de: 'Die Festung Masmak, um 1865 aus Lehm und Lehmziegeln im alten Viertel Dirah erbaut. 1902 eroberte Abdulaziz Al Saud von hier aus Riad zurück, der erste Schritt zum modernen Königreich. Heute ist sie ein Museum.',
    zh: '马斯马克城堡，约建于1865年，由黏土和泥砖筑成，位于老城迪拉区。1902年，阿卜杜勒阿齐兹·阿勒沙特从这里收复利雅得，迈出了建立现代王国的第一步。如今这里是一座博物馆。'
  }],
  ['museum', 24, {
    ar: 'المتحف الوطني السعودي، افتُتح عام 1999 ضمن مركز الملك عبدالعزيز التاريخي في المربع. تروي قاعاته تاريخ الجزيرة العربية من عصور ما قبل التاريخ حتى توحيد المملكة.',
    en: 'The National Museum of Saudi Arabia opened in 1999 in the King Abdulaziz Historical Centre in Al Murabba. Its halls tell the story of Arabia from prehistoric times to the unification of the kingdom.',
    fr: 'Le Musée national d\'Arabie saoudite a ouvert en 1999 dans le centre historique du roi Abdelaziz, à Al Murabba. Ses salles racontent l\'Arabie de la préhistoire jusqu\'à l\'unification du royaume.',
    es: 'El Museo Nacional de Arabia Saudí abrió en 1999 en el Centro Histórico Rey Abdulaziz, en Al Murabba. Sus salas cuentan la historia de Arabia desde la prehistoria hasta la unificación del reino.',
    de: 'Das Saudische Nationalmuseum wurde 1999 im historischen König-Abdulaziz-Zentrum in Al Murabba eröffnet. Seine Säle erzählen die Geschichte Arabiens von der Vorgeschichte bis zur Einigung des Königreichs.',
    zh: '沙特国家博物馆于1999年在穆拉巴区的阿卜杜勒阿齐兹国王历史中心开馆，展厅讲述了从史前时代到王国统一的阿拉伯半岛历史。'
  }],
  ['water', 64, {
    ar: 'برج مياه الرياض، صممه المعماري السويدي سونه ليندستروم وبُني مطلع السبعينيات. شكله المميز جعله من رموز المدينة الحديثة.',
    en: 'The Riyadh Water Tower, designed by the Swedish architect Sune Lindström and built in the early 1970s. Its distinctive shape made it an early symbol of the modern city.',
    fr: 'Le château d\'eau de Riyad, dessiné par l\'architecte suédois Sune Lindström et construit au début des années 1970. Sa silhouette en a fait l\'un des premiers symboles de la ville moderne.',
    es: 'La Torre del Agua de Riad, diseñada por el arquitecto sueco Sune Lindström y construida a principios de los años setenta. Su forma la convirtió en un símbolo temprano de la ciudad moderna.',
    de: 'Der Wasserturm von Riad, entworfen vom schwedischen Architekten Sune Lindström und Anfang der 1970er Jahre gebaut. Seine markante Form machte ihn zu einem frühen Wahrzeichen der modernen Stadt.',
    zh: '利雅得水塔由瑞典建筑师松内·林德斯特伦设计，建于二十世纪七十年代初，其独特造型使它成为现代利雅得的早期标志。'
  }],
  ['tv', 172, {
    ar: 'برج التلفزيون في الرياض، يرتفع نحو 170 متراً، وافتُتح عام 1978 ليحمل البث الإذاعي والتلفزيوني للعاصمة.',
    en: 'The Riyadh TV Tower rises about 170 metres. It opened in 1978 to carry the capital\'s radio and television broadcasts.',
    fr: 'La tour de télévision de Riyad s\'élève à environ 170 mètres. Inaugurée en 1978, elle diffuse la radio et la télévision de la capitale.',
    es: 'La Torre de Televisión de Riad mide unos 170 metros. Se inauguró en 1978 para transmitir la radio y la televisión de la capital.',
    de: 'Der Fernsehturm von Riad ist rund 170 Meter hoch. Er wurde 1978 eröffnet und überträgt Radio und Fernsehen der Hauptstadt.',
    zh: '利雅得电视塔高约170米，于1978年启用，承担首都的广播和电视信号传输。'
  }],
  ['moi', 66, {
    ar: 'مقر وزارة الداخلية، بتصميمه الشبيه بهرم مقلوب، من أكثر المباني تميزاً في عمارة الرياض الحديثة.',
    en: 'The Ministry of Interior headquarters. Its shape, like an upside-down pyramid, makes it one of the most striking buildings in modern Riyadh.',
    fr: 'Le siège du ministère de l\'Intérieur. Sa forme de pyramide inversée en fait l\'un des bâtiments les plus saisissants de Riyad.',
    es: 'La sede del Ministerio del Interior. Su forma de pirámide invertida la convierte en uno de los edificios más llamativos de Riad.',
    de: 'Der Sitz des Innenministeriums. Seine Form einer umgedrehten Pyramide macht ihn zu einem der auffälligsten Gebäude Riads.',
    zh: '内政部总部大楼，形似倒置的金字塔，是利雅得现代建筑中最引人注目的建筑之一。'
  }],
  ['library', 32, {
    ar: 'مكتبة الملك فهد الوطنية، تكسوها واجهة من أشرعة القماش الأبيض مستوحاة من الخيمة العربية، تظلل المبنى من شمس الرياض.',
    en: 'King Fahd National Library. A facade of white fabric sails, inspired by the Arabian tent, shades the building from the Riyadh sun.',
    fr: 'La Bibliothèque nationale du roi Fahd. Une façade de voiles de tissu blanc, inspirée de la tente arabe, protège le bâtiment du soleil.',
    es: 'La Biblioteca Nacional Rey Fahd. Una fachada de velas de tela blanca, inspirada en la tienda árabe, protege el edificio del sol.',
    de: 'Die König-Fahd-Nationalbibliothek. Eine Fassade aus weißen Stoffsegeln, inspiriert vom arabischen Zelt, schützt das Gebäude vor der Sonne.',
    zh: '法赫德国王国家图书馆，外墙覆盖着受阿拉伯帐篷启发的白色织物帆，为建筑遮挡利雅得的烈日。'
  }],
  ['faisaliah', 267, {
    ar: 'برج الفيصلية، أول ناطحة سحاب في المملكة، اكتمل عام 2000 بارتفاع 267 متراً من تصميم فوستر وشركاه. تعلوه كرة زجاجية ذهبية فيها مطعم.',
    en: 'Al Faisaliah Tower, the first skyscraper in Saudi Arabia, completed in 2000. Designed by Foster and Partners, it is 267 metres tall and crowned by a golden glass globe with a restaurant inside.',
    fr: 'La tour Al Faisaliah, premier gratte-ciel d\'Arabie saoudite, achevée en 2000. Conçue par Foster and Partners, elle mesure 267 mètres et porte une sphère de verre doré abritant un restaurant.',
    es: 'La Torre Al Faisaliah, el primer rascacielos de Arabia Saudí, terminada en 2000. Diseñada por Foster and Partners, mide 267 metros y la corona una esfera de cristal dorado con un restaurante.',
    de: 'Der Al-Faisaliah-Turm, der erste Wolkenkratzer Saudi-Arabiens, fertiggestellt im Jahr 2000. Von Foster and Partners entworfen, ist er 267 Meter hoch und trägt eine goldene Glaskugel mit einem Restaurant.',
    zh: '费萨利亚塔是沙特第一座摩天大楼，于2000年建成，由福斯特建筑事务所设计，高267米，顶部金色玻璃球内设有餐厅。'
  }],
  ['tahlia', 14, {
    ar: 'شارع التحلية، من أشهر شوارع الرياض، تصطف على جانبيه المقاهي والمطاعم والمتاجر، ويزدحم بالحياة في المساء.',
    en: 'Tahlia Street, one of Riyadh\'s best-known streets, lined with cafés, restaurants and shops, and busiest in the evening.',
    fr: 'La rue Tahlia, l\'une des plus connues de Riyad, bordée de cafés, de restaurants et de boutiques, très animée le soir.',
    es: 'La calle Tahlia, una de las más conocidas de Riad, llena de cafés, restaurantes y tiendas, y muy animada por la noche.',
    de: 'Die Tahlia-Straße, eine der bekanntesten Straßen Riads, gesäumt von Cafés, Restaurants und Geschäften, abends besonders belebt.',
    zh: '塔赫利亚街是利雅得最著名的街道之一，两旁咖啡馆、餐厅和商店林立，夜晚尤为热闹。'
  }],
  ['kingdom', 302, {
    ar: 'برج المملكة، بارتفاع 302 متر، اكتمل عام 2002. الفتحة الواسعة في قمته يعلوها جسر زجاجي معلّق يطل منه الزوار على الرياض كلها.',
    en: 'Kingdom Centre, 302 metres tall, completed in 2002. The wide opening at its top is spanned by a sky bridge, where visitors look out over the whole of Riyadh.',
    fr: 'Le Kingdom Centre, haut de 302 mètres, achevé en 2002. La grande ouverture à son sommet est traversée par une passerelle d\'où l\'on domine tout Riyad.',
    es: 'El Kingdom Centre, de 302 metros, terminado en 2002. Su gran abertura superior la cruza un puente panorámico desde el que se ve todo Riad.',
    de: 'Das Kingdom Centre, 302 Meter hoch, fertiggestellt 2002. Über die große Öffnung an der Spitze spannt sich eine Himmelsbrücke mit Blick über ganz Riad.',
    zh: '王国中心高302米，于2002年建成。顶部宽阔的开口上横跨一座空中天桥，游客可在此俯瞰整个利雅得。'
  }],
  ['kafd', 385, {
    ar: 'مركز الملك عبدالله المالي، حي أعمال حديث، يتوسطه برج صندوق الاستثمارات العامة بارتفاع نحو 385 متراً، وهو أعلى مباني الرياض.',
    en: 'The King Abdullah Financial District, a new business quarter. At its centre stands the PIF Tower, about 385 metres tall, the highest building in Riyadh.',
    fr: 'Le quartier financier du roi Abdallah, un nouveau quartier d\'affaires. En son centre se dresse la tour PIF, d\'environ 385 mètres, la plus haute de Riyad.',
    es: 'El Distrito Financiero Rey Abdalá, un nuevo barrio de negocios. En su centro se alza la Torre PIF, de unos 385 metros, el edificio más alto de Riad.',
    de: 'Der König-Abdullah-Finanzdistrikt, ein neues Geschäftsviertel. In seiner Mitte steht der PIF-Turm, rund 385 Meter hoch, das höchste Gebäude Riads.',
    zh: '阿卜杜拉国王金融区是一个新兴商务区，中心矗立着约385米高的公共投资基金大厦，是利雅得最高的建筑。'
  }],
  ['rafal', 308, {
    ar: 'برج رافال على طريق الملك فهد شمالاً، برج سكني وفندقي بارتفاع 308 أمتار اكتمل عام 2014.',
    en: 'Burj Rafal, on King Fahd Road in the north of the city, a residential and hotel tower 308 metres tall, completed in 2014.',
    fr: 'La tour Rafal, sur la route du roi Fahd au nord de la ville, tour résidentielle et hôtelière de 308 mètres achevée en 2014.',
    es: 'La Torre Rafal, en la carretera del Rey Fahd al norte de la ciudad, torre residencial y hotelera de 308 metros terminada en 2014.',
    de: 'Der Burj Rafal an der König-Fahd-Straße im Norden der Stadt, ein 308 Meter hoher Wohn- und Hotelturm, fertiggestellt 2014.',
    zh: '拉法尔塔位于城北的法赫德国王路旁，是一座高308米的住宅和酒店大楼，于2014年建成。'
  }],
  ['turaif', 26, {
    ar: 'حي الطريف في الدرعية، عاصمة الدولة السعودية الأولى في القرن الثامن عشر. قصوره الطينية على ضفاف وادي حنيفة مسجّلة في قائمة التراث العالمي لليونسكو منذ عام 2010.',
    en: 'At-Turaif in Diriyah, capital of the first Saudi state in the eighteenth century. Its mud-brick palaces above Wadi Hanifa have been a UNESCO World Heritage Site since 2010.',
    fr: 'At-Turaif à Diriyah, capitale du premier État saoudien au dix-huitième siècle. Ses palais en terre au-dessus du wadi Hanifa sont inscrits au patrimoine mondial de l\'UNESCO depuis 2010.',
    es: 'At-Turaif, en Diriyah, capital del primer Estado saudí en el siglo dieciocho. Sus palacios de adobe sobre el wadi Hanifa son Patrimonio Mundial de la UNESCO desde 2010.',
    de: 'At-Turaif in Diriyah, im achtzehnten Jahrhundert Hauptstadt des ersten saudischen Staates. Seine Lehmpaläste über dem Wadi Hanifa sind seit 2010 UNESCO-Welterbe.',
    zh: '德拉伊耶的图赖夫区是十八世纪第一沙特国的首都，哈尼法河谷之上的泥砖宫殿自2010年起被列入联合国教科文组织世界遗产名录。'
  }]
];

const CSS = `
#tour-panel { position: fixed; z-index: 25; left: 0; right: 0; margin: 0 auto; width: min(560px, calc(100vw - 24px)); bottom: calc(env(safe-area-inset-bottom, 0px) + 16px); background: rgba(20,16,12,0.9); color: #fbf6ec; border: 1px solid rgba(243,215,154,0.35); border-radius: 14px; padding: 12px 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.45); backdrop-filter: blur(10px); }
#tour-panel .top { display: flex; align-items: center; gap: 8px; }
#tour-panel .top b { font-size: 16px; white-space: nowrap; } #tour-panel .top small { white-space: nowrap; }
@media (max-width: 440px) { #tour-panel .top b { display: none; } #tour-panel .tb { min-width: 38px; padding: 0 8px; } } #tour-panel .top small { opacity: .7; font-size: 12px; }
#tour-panel .top .sp { flex: 1; }
#tour-panel select { height: 34px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: #2a231b; color: #fbf6ec; font: inherit; font-size: 13px; padding: 0 6px; }
#tour-panel .tb { height: 34px; min-width: 34px; padding: 0 10px; border-radius: 8px; border: 0; background: rgba(255,255,255,0.1); color: #fbf6ec; font: inherit; font-size: 13px; cursor: pointer; }
#tour-panel .tb.go { background: #1f9d63; color: #fff; }
#tour-panel .cap { margin-top: 10px; font-size: 15px; line-height: 1.7; min-height: 3.4em; }
#tour-panel .cap h4 { margin: 0 0 2px; color: #f3d79a; font-size: 17px; }
#tour-panel .bar { height: 3px; border-radius: 3px; background: rgba(255,255,255,0.12); margin-top: 8px; overflow: hidden; } #tour-panel .bar i { display: block; height: 100%; width: 0; background: #f3d79a; }
#tour-panel .note { font-size: 11.5px; opacity: .7; margin-top: 4px; }
body.touring #touch-controls, body.touring .hud-bottom, body.touring #guide-nav { display: none !important; }
@media (pointer: coarse) and (orientation: portrait) { #tour-panel .cap { font-size: 14px; } }
`;
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

export class Tour {
  constructor({ camera, onEnd }) {
    this.camera = camera; this.onEnd = onEnd;
    this.active = false; this.paused = false; this.muted = false;
    try { this.lang = localStorage.getItem('riyadh-tour-lang') || ''; } catch (e) { this.lang = ''; }
    if (!LANGS.find((l) => l.id === this.lang)) this.lang = (navigator.language || 'ar').slice(0, 2);
    if (!LANGS.find((l) => l.id === this.lang)) this.lang = 'en';
    this.stops = STOPS.map(([key, h, text]) => ({ key, h, text, ...PLACES[key] }));
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = document.createElement('div'); this.el.id = 'tour-panel'; this.el.hidden = true; document.body.appendChild(this.el);
    this.synth = window.speechSynthesis || null;
    this.synth?.getVoices();
    if (this.synth) this.synth.onvoiceschanged = () => this.synth.getVoices();
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
  }
  get ui() { return UI[this.lang]; }
  voiceFor(lang) {
    if (!this.synth) return null;
    const L = LANGS.find((l) => l.id === lang), vs = this.synth.getVoices();
    return vs.find((v) => v.lang === L.bcp) || vs.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang)) || null;
  }
  // ---- panel
  render() {
    const u = this.ui, L = LANGS.find((l) => l.id === this.lang);
    this.el.dir = L.dir;
    const n = this.stops.length, i = Math.min(this.i, n - 1);
    const stopName = this.phase === 'intro' || this.phase === 'outro' ? u.title : PLACES[this.stops[i].key][this.lang === 'ar' ? 'ar' : 'en'];
    this.el.innerHTML = `<div class="top"><b>${u.title}</b><small>${this.phase === 'intro' ? '' : Math.min(n, i + 1) + ' / ' + n}</small><span class="sp"></span>
      <select aria-label="${u.lang}">${LANGS.map((l) => `<option value="${l.id}"${l.id === this.lang ? ' selected' : ''}>${l.name}</option>`).join('')}</select>
      <button class="tb" data-a="mute" type="button" title="${this.muted ? u.unmute : u.mute}">${this.muted ? '🔇' : '🔊'}</button>
      <button class="tb" data-a="pause" type="button" title="${this.paused ? u.play : u.pause}">${this.paused ? '▶' : '❚❚'}</button>
      <button class="tb" data-a="next" type="button" title="${u.next}">⏭</button>
      <button class="tb" data-a="end" type="button" title="${u.end}">✕</button></div>
      <div class="cap"><h4>${stopName}</h4><span class="txt"></span></div><div class="bar"><i></i></div>
      ${!this.muted && this.synth && !this.voiceFor(this.lang) ? `<div class="note">${u.noVoice}</div>` : ''}`;
    this.el.querySelector('select').onchange = (e) => {
      this.lang = e.target.value;
      try { localStorage.setItem('riyadh-tour-lang', this.lang); } catch (err) { /* private mode */ }
      this.say(this.caption);   // repeat the current part in the new language
    };
    this.el.querySelector('[data-a="mute"]').onclick = () => { this.muted = !this.muted; if (this.muted) this.synth?.cancel(); else this.say(this.caption); };
    this.el.querySelector('[data-a="pause"]').onclick = () => { this.paused = !this.paused; if (this.paused) this.synth?.pause(); else this.synth?.resume(); this.render(); this.setText(); };
    this.el.querySelector('[data-a="next"]').onclick = () => this.advance();
    this.el.querySelector('[data-a="end"]').onclick = () => this.stop();
    this.setText();
  }
  setText() { const t = this.el.querySelector('.txt'); if (t && this.caption) t.textContent = this.caption[this.lang]; }
  // ---- narration
  say(text) {
    this.caption = text;
    this.render();
    this.spoken = false; this.sayT = 0;
    // without a voice, hold the subtitle for a reading time
    this.minHold = Math.max(6, text[this.lang].length / (this.lang === 'zh' ? 5 : 15));
    this.synth?.cancel();
    if (!this.synth || this.muted) { this.spoken = true; return; }
    // one utterance per sentence: some browsers cut long utterances off after about 15 seconds
    const parts = text[this.lang].split(/(?<=[.!?。؟])\s*/).filter((t) => t.trim());
    const L = LANGS.find((l) => l.id === this.lang), v = this.voiceFor(this.lang);
    this.talking = true;
    const token = (this.token = {});
    parts.forEach((t, k) => {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = L.bcp; if (v) u.voice = v; u.rate = 0.95;
      if (k === parts.length - 1) { const done = () => { if (this.token === token) { this.talking = false; this.spoken = true; } }; u.onend = done; u.onerror = done; }
      this.synth.speak(u);
    });
  }
  // ---- flow
  start(fromPos, fromLook) {
    this.active = true; this.paused = false; this.i = 0; this.phase = 'intro';
    document.body.classList.add('touring');
    this.el.hidden = false;
    this.pos.copy(fromPos); this.look.copy(fromLook);
    this.beginFlight(this.stops[0]);
    this.say(INTRO);
  }
  stop(finished) {
    if (!this.active) return;
    this.active = false; this.synth?.cancel(); this.token = null;
    this.el.hidden = true; document.body.classList.remove('touring');
    this.onEnd?.(this.stops[Math.min(this.i, this.stops.length - 1)], finished);
  }
  orbitFor(s) { const r = Math.max(110, s.h * 1.15), y = Math.max(45, s.h * 0.55 + 30); return { r, y, ly: Math.max(8, s.h * 0.45) }; }
  beginFlight(s) {
    const o = this.orbitFor(s);
    this.fly = { t: 0, p0: this.pos.clone(), l0: this.look.clone(), s, o };
    const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
    this.fly.T = Math.min(16, Math.max(5, 3 + d / 900));
    this.fly.a1 = Math.atan2(this.pos.z - s.z, this.pos.x - s.x);   // arrive on the side we come from
    this.fly.cruise = Math.min(450, Math.max(o.y + 40, d * 0.06));
    if (this.phase !== 'intro') this.phase = 'fly';
    this.orbitA = this.fly.a1; this.orbitT = 0;
  }
  advance() {
    if (!this.active) return;
    if (this.phase === 'outro') { this.stop(true); return; }
    if (this.phase === 'fly' || this.phase === 'intro') { this.arrive(); return; }
    this.i++;
    if (this.i >= this.stops.length) { this.phase = 'outro'; this.i = this.stops.length - 1; this.say(OUTRO); return; }
    const nx = this.stops[this.i];
    this.beginFlight(nx);
    this.say(Object.fromEntries(LANGS.map((l) => [l.id, NEXT[l.id] + (l.id === 'ar' ? nx.ar : nx.en)])));
  }
  arrive() {
    const s = this.stops[this.i];
    this.fly = null; this.phase = 'orbit'; this.orbitT = 0;
    this.say(s.text);
  }
  // camera pose for this frame
  update(dt) {
    if (!this.active) return;
    if (this.paused) return;
    this.sayT += dt;
    // some engines never report the end of speech: give up waiting after a generous reading time
    if (!this.spoken && this.sayT > this.minHold * 1.8 + 3) { this.spoken = true; this.talking = false; }
    const bar = this.el.querySelector('.bar i');
    if (this.fly) {
      const f = this.fly; f.t += dt;
      const k = ease(f.t / f.T), s = f.s, o = f.o;
      const tx = s.x + Math.cos(f.a1) * o.r, tz = s.z + Math.sin(f.a1) * o.r;
      // up, across and down in one smooth arc
      const lift = Math.sin(Math.PI * Math.min(1, f.t / f.T)) * (f.cruise - Math.max(f.p0.y, o.y) * 0.5);
      this.pos.set(f.p0.x + (tx - f.p0.x) * k, f.p0.y + (o.y - f.p0.y) * k + Math.max(0, lift), f.p0.z + (tz - f.p0.z) * k);
      const kl = ease(f.t / f.T * 1.25);
      this.look.set(f.l0.x + (s.x - f.l0.x) * kl, f.l0.y + (o.ly - f.l0.y) * kl, f.l0.z + (s.z - f.l0.z) * kl);
      if (bar) bar.style.width = (k * 100).toFixed(1) + '%';
      // the intro keeps talking over the first flight; arrive once both are done
      if (f.t >= f.T && (this.phase !== 'intro' || (this.spoken && this.sayT > this.minHold * 0.6))) this.arrive();
      return;
    }
    const s = this.stops[this.i], o = this.orbitFor(s);
    this.orbitT += dt;
    this.orbitA += dt * (o.r > 250 ? 0.07 : 0.11);
    this.pos.set(s.x + Math.cos(this.orbitA) * o.r, o.y + Math.sin(this.orbitT * 0.3) * o.y * 0.08, s.z + Math.sin(this.orbitA) * o.r);
    this.look.set(s.x, o.ly, s.z);
    const hold = this.muted || !this.synth ? this.minHold : Math.max(4, this.minHold * 0.5);
    if (bar) bar.style.width = Math.min(100, (this.sayT / (hold + 2)) * 100).toFixed(1) + '%';
    if (this.spoken && this.sayT > hold && !this.talking) {
      this.waitT = (this.waitT || 0) + dt;
      if (this.waitT > 2) { this.waitT = 0; this.advance(); }
    }
  }
}
