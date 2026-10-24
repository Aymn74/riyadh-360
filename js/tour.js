// tour.js — an automatic sightseeing tour: the camera flies from landmark to landmark, circles each one,
// and a narrator (the browser's own speech voices) tells its story in the chosen language, with subtitles.
import * as THREE from 'three';
import { PLACES } from './geo.js';
import { esc } from './util.js';

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
export const ARRIVED = { ar: 'وصلت إلى ', en: 'You have arrived at ', fr: 'Vous êtes arrivé : ', es: 'Ha llegado a ', de: 'Angekommen: ', zh: '您已到达' };
const DISTRICT = { ar: (d) => 'حي ' + d.ar, en: (d) => d.en + ' district', fr: (d) => 'Quartier ' + d.en, es: (d) => 'Barrio ' + d.en, de: (d) => 'Viertel ' + d.en, zh: (d) => d.en };
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
  }],
  // ---- stops added with the wider guide (positions from OpenStreetMap)
  ['hokm', 22, {
    ar: 'قصر الحكم، مقر الحكم التاريخي في قلب الرياض القديمة. أعيد بناؤه ضمن مشروع تطوير منطقة قصر الحكم، وتحيط به اليوم الساحات والأسواق.',
    en: 'Qasr Al-Hokm, the historic seat of government in the heart of old Riyadh. It was rebuilt as part of the Qasr Al-Hokm district project and is now surrounded by squares and markets.',
    fr: 'Qasr Al-Hokm, siège historique du pouvoir au cœur du vieux Riyad. Reconstruit dans le cadre du projet du quartier de Qasr Al-Hokm, il est aujourd\'hui entouré de places et de marchés.',
    es: 'Qasr Al-Hokm, la sede histórica del gobierno en el corazón del viejo Riad. Fue reconstruido dentro del proyecto del distrito de Qasr Al-Hokm y hoy lo rodean plazas y mercados.',
    de: 'Qasr Al-Hokm, der historische Regierungssitz im Herzen der Altstadt. Er wurde im Rahmen des Projekts für das Qasr-Al-Hokm-Viertel neu errichtet und ist heute von Plätzen und Märkten umgeben.',
    zh: '胡克姆宫是利雅得老城中心的历史政府所在地。它在胡克姆宫区改造项目中重建，如今四周环绕着广场和市场。'
  }],
  ['turkiMosque', 50, {
    ar: 'جامع الإمام تركي بن عبدالله، الجامع الكبير في قلب الرياض بجوار قصر الحكم. يُعد من أبرز أمثلة العمارة النجدية الحديثة.',
    en: 'The Imam Turki bin Abdullah Grand Mosque, the great mosque at the heart of Riyadh beside Qasr Al-Hokm. It is one of the finest examples of modern Najdi architecture.',
    fr: 'La grande mosquée de l\'imam Turki ben Abdallah, au cœur de Riyad, à côté de Qasr Al-Hokm. C\'est l\'un des plus beaux exemples d\'architecture najdie moderne.',
    es: 'La Gran Mezquita del Imam Turki bin Abdalá, en el corazón de Riad junto a Qasr Al-Hokm. Es uno de los mejores ejemplos de la arquitectura najdí moderna.',
    de: 'Die Große Moschee Imam Turki bin Abdullah im Herzen Riads, neben Qasr Al-Hokm. Sie ist eines der schönsten Beispiele moderner Nadschd-Architektur.',
    zh: '伊玛目图尔基·本·阿卜杜拉大清真寺位于利雅得市中心，紧邻胡克姆宫，是现代纳季德建筑的杰出代表。'
  }],
  ['zal', 12, {
    ar: 'سوق الزل، من أقدم أسواق الرياض الشعبية. يشتهر بالمشالح والسجاد والبخور والعطور، وفيه حراج لبيع الأغراض القديمة.',
    en: 'Souq Al-Zal, one of Riyadh\'s oldest traditional markets. It is known for bishts, carpets, incense and perfume, and has an auction for old goods.',
    fr: 'Le souk Al-Zal, l\'un des plus anciens marchés traditionnels de Riyad. On y trouve des bishts, des tapis, de l\'encens et des parfums, et une vente aux enchères d\'objets anciens.',
    es: 'El zoco Al-Zal, uno de los mercados tradicionales más antiguos de Riad. Es famoso por sus bishts, alfombras, incienso y perfumes, y tiene una subasta de objetos antiguos.',
    de: 'Der Souk Al-Zal, einer der ältesten traditionellen Märkte Riads. Er ist bekannt für Bischts, Teppiche, Weihrauch und Parfüm und hat eine Auktion für alte Waren.',
    zh: '扎尔市场是利雅得最古老的传统市场之一，以长袍、地毯、熏香和香水闻名，还有旧货拍卖。'
  }],
  ['thumairi', 13, {
    ar: 'بوابة الثميري، إحدى بوابات سور الرياض القديم، وكانت مدخل المدينة من جهة الشرق. هُدم السور في منتصف القرن العشرين، ثم أعيد بناء البوابة بالطين على طرازها النجدي، وتقف اليوم وسط طريق الملك فيصل قرب قصر المصمك.',
    en: 'Al-Thumairi Gate, one of the gates in the wall of old Riyadh, through which the city opened to the east. The wall came down in the mid-twentieth century; the gate was rebuilt in mud brick in its Najdi style and now stands in the middle of King Faisal Road, near Masmak.',
    fr: 'La porte d\'Al-Thumairi, l\'une des portes de l\'enceinte du vieux Riyad, par laquelle la ville s\'ouvrait vers l\'est. Le mur fut démoli au milieu du vingtième siècle ; la porte a été reconstruite en terre crue dans son style najdi et se dresse aujourd\'hui au milieu de la route du Roi-Fayçal, près de Masmak.',
    es: 'La puerta de Al-Thumairi, una de las puertas de la muralla del antiguo Riad, por la que la ciudad se abría al este. La muralla se derribó a mediados del siglo veinte; la puerta se reconstruyó en adobe con su estilo najdí y hoy se alza en medio de la avenida del Rey Faisal, cerca de Masmak.',
    de: 'Das Thumairi-Tor, eines der Tore in der Mauer des alten Riad, durch das sich die Stadt nach Osten öffnete. Die Mauer wurde Mitte des zwanzigsten Jahrhunderts abgerissen; das Tor wurde im Najdi-Stil aus Lehm wieder aufgebaut und steht heute mitten auf der König-Faisal-Straße, nahe Masmak.',
    zh: '图麦里门是利雅得老城墙的城门之一，城市由此向东敞开。城墙在二十世纪中叶被拆除；城门后来以内志风格用泥砖重建，如今矗立在费萨尔国王路中央，靠近马斯马克城堡。'
  }],
  ['murabba', 16, {
    ar: 'قصر المربع، بناه الملك عبدالعزيز من الطين أواخر الثلاثينيات خارج أسوار الرياض القديمة. كان سكنه ومقر حكمه، وهو اليوم متحف ضمن مركز الملك عبدالعزيز التاريخي.',
    en: 'Murabba Palace, built of mud brick by King Abdulaziz in the late 1930s outside the walls of old Riyadh. It was his home and seat of government, and is now a museum in the King Abdulaziz Historical Centre.',
    fr: 'Le palais de Murabba, bâti en terre par le roi Abdelaziz à la fin des années 1930, hors des remparts du vieux Riyad. Ce fut sa résidence et son siège du pouvoir ; c\'est aujourd\'hui un musée.',
    es: 'El Palacio de Murabba, construido en adobe por el rey Abdulaziz a finales de los años treinta, fuera de las murallas del viejo Riad. Fue su residencia y sede de gobierno; hoy es un museo.',
    de: 'Der Murabba-Palast, Ende der 1930er Jahre von König Abdulaziz aus Lehm außerhalb der alten Stadtmauern erbaut. Er war sein Wohnsitz und Regierungssitz und ist heute ein Museum.',
    zh: '穆拉巴宫由阿卜杜勒阿齐兹国王于二十世纪三十年代末用泥砖建造，位于老城墙之外，曾是他的住所和执政之地，如今是一座博物馆。'
  }],
  ['ksu', 30, {
    ar: 'جامعة الملك سعود، أول جامعة في المملكة، تأسست عام 1957. حرمها الرئيسي من أكبر الحرم الجامعية في المنطقة.',
    en: 'King Saud University, the first university in Saudi Arabia, founded in 1957. Its main campus is one of the largest in the region.',
    fr: 'L\'université du roi Saoud, première université d\'Arabie saoudite, fondée en 1957. Son campus principal est l\'un des plus grands de la région.',
    es: 'La Universidad Rey Saud, la primera universidad de Arabia Saudí, fundada en 1957. Su campus principal es uno de los más grandes de la región.',
    de: 'Die König-Saud-Universität, die erste Universität Saudi-Arabiens, gegründet 1957. Ihr Hauptcampus gehört zu den größten der Region.',
    zh: '沙特国王大学是沙特阿拉伯第一所大学，创建于1957年，其主校区是该地区最大的校园之一。'
  }],
  ['boulevard', 30, {
    ar: 'بوليفارد رياض سيتي، منطقة ترفيه ومطاعم ومسارح. وهو من أبرز وجهات موسم الرياض، ويضج بالحياة في المساء.',
    en: 'Boulevard Riyadh City, a district of entertainment, restaurants and theatres. It is a highlight of Riyadh Season and comes alive in the evening.',
    fr: 'Boulevard Riyadh City, un quartier de divertissement, de restaurants et de théâtres. C\'est l\'un des temps forts de la saison de Riyad, très animé le soir.',
    es: 'Boulevard Riyadh City, una zona de ocio, restaurantes y teatros. Es uno de los grandes atractivos de la temporada de Riad y cobra vida por la noche.',
    de: 'Boulevard Riyadh City, ein Viertel mit Unterhaltung, Restaurants und Theatern. Es ist ein Höhepunkt der Riyadh Season und erwacht am Abend zum Leben.',
    zh: '利雅得城市大道是集娱乐、餐饮和剧院于一体的街区，是利雅得季的亮点，夜晚尤为热闹。'
  }],
  ['bujairi', 14, {
    ar: 'مطل البجيري في الدرعية، مطاعم ومقاهٍ على ضفة وادي حنيفة. تطل مباشرة على قصور حي الطريف.',
    en: 'Al-Bujairi Terrace in Diriyah, restaurants and cafés on the bank of Wadi Hanifa. They look straight across to the palaces of At-Turaif.',
    fr: 'La terrasse d\'Al-Bujairi à Diriyah, des restaurants et des cafés au bord du wadi Hanifa. Ils font face aux palais d\'At-Turaif.',
    es: 'La terraza de Al-Bujairi en Diriyah, restaurantes y cafés a orillas del wadi Hanifa. Miran directamente a los palacios de At-Turaif.',
    de: 'Die Al-Bujairi-Terrasse in Diriyah, Restaurants und Cafés am Ufer des Wadi Hanifa. Sie blicken direkt hinüber zu den Palästen von At-Turaif.',
    zh: '德拉伊耶的布贾伊里露台沿哈尼法河谷而建，餐厅和咖啡馆林立，正对图赖夫区的宫殿。'
  }]
];

// themed tours: which stops each theme visits, and which stops matter most when time is short
// travelling order: the old town, north past the towers, west to the Boulevard and the university, ending in Diriyah
// stops that need a wider or higher circle: Tahlia is a street lined with towers, the library a 145 m cube,
// the museum 330 m long, and Al-Thumairi Gate is small enough to need a close look
const VIEW = { tahlia: { r: 320, y: 250, ly: 0 }, library: { r: 175, y: 70, ly: 14 }, museum: { r: 240, y: 85, ly: 10 }, thumairi: { r: 48, y: 19, ly: 6 } };
const ORDER = ['hokm', 'turkiMosque', 'masmak', 'thumairi', 'zal', 'water', 'murabba', 'museum', 'tv', 'moi', 'library', 'faisaliah', 'tahlia', 'kingdom', 'rafal', 'kafd', 'boulevard', 'ksu', 'bujairi', 'turaif'];
const THEMES = {
  all: ORDER,
  history: ['hokm', 'masmak', 'thumairi', 'zal', 'murabba', 'museum', 'turaif'],
  towers: ['tv', 'faisaliah', 'kingdom', 'rafal', 'kafd'],
  culture: ['turkiMosque', 'museum', 'moi', 'library', 'faisaliah', 'kingdom', 'ksu'],
  market: ['zal', 'tahlia', 'boulevard', 'bujairi']
};
const RANK = ['kingdom', 'masmak', 'faisaliah', 'turaif', 'kafd', 'museum', 'zal', 'murabba', 'hokm', 'turkiMosque', 'ksu', 'boulevard', 'bujairi', 'library', 'tahlia', 'rafal', 'tv', 'moi', 'water', 'thumairi'];
const DURS = { short: { max: 4, brief: true }, medium: { max: 7, brief: false }, full: { max: 99, brief: false } };
const B = {
  ar: { design: 'صمّم جولتك', theme: 'الموضوع', length: 'المدة', themes: { all: 'شاملة', history: 'تاريخية', towers: 'الأبراج', culture: 'عمارة وثقافة', market: 'أسواق ومطاعم' }, durs: { short: 'قصيرة', medium: 'متوسطة', full: 'كاملة' }, about: 'نحو', min: 'دقيقة', stops: 'محطات', go: 'ابدأ الجولة', cancel: 'إلغاء' },
  en: { design: 'Plan your tour', theme: 'Theme', length: 'Length', themes: { all: 'Everything', history: 'History', towers: 'Skyline', culture: 'Architecture & culture', market: 'Souqs & food' }, durs: { short: 'Short', medium: 'Medium', full: 'Full' }, about: 'about', min: 'min', stops: 'stops', go: 'Start the tour', cancel: 'Cancel' },
  fr: { design: 'Composez votre visite', theme: 'Thème', length: 'Durée', themes: { all: 'Tout', history: 'Histoire', towers: 'Gratte-ciel', culture: 'Architecture et culture', market: 'Souks et cuisine' }, durs: { short: 'Courte', medium: 'Moyenne', full: 'Complète' }, about: 'environ', min: 'min', stops: 'étapes', go: 'Commencer la visite', cancel: 'Annuler' },
  es: { design: 'Diseñe su recorrido', theme: 'Tema', length: 'Duración', themes: { all: 'Todo', history: 'Historia', towers: 'Rascacielos', culture: 'Arquitectura y cultura', market: 'Zocos y comida' }, durs: { short: 'Corta', medium: 'Media', full: 'Completa' }, about: 'unos', min: 'min', stops: 'paradas', go: 'Empezar el recorrido', cancel: 'Cancelar' },
  de: { design: 'Rundgang planen', theme: 'Thema', length: 'Dauer', themes: { all: 'Alles', history: 'Geschichte', towers: 'Skyline', culture: 'Architektur und Kultur', market: 'Souks und Essen' }, durs: { short: 'Kurz', medium: 'Mittel', full: 'Ganz' }, about: 'ca.', min: 'Min.', stops: 'Stationen', go: 'Rundgang starten', cancel: 'Abbrechen' },
  zh: { design: '定制您的游览', theme: '主题', length: '时长', themes: { all: '全部', history: '历史', towers: '摩天楼', culture: '建筑与文化', market: '市场与美食' }, durs: { short: '短', medium: '中', full: '完整' }, about: '约', min: '分钟', stops: '站', go: '开始游览', cancel: '取消' }
};
const WELCOME = { ar: 'أهلاً بكم في الرياض، عاصمة المملكة العربية السعودية.', en: 'Welcome to Riyadh, the capital of Saudi Arabia.', fr: 'Bienvenue à Riyad, capitale de l\'Arabie saoudite.', es: 'Bienvenidos a Riad, la capital de Arabia Saudí.', de: 'Willkommen in Riad, der Hauptstadt Saudi-Arabiens.', zh: '欢迎来到沙特阿拉伯首都利雅得。' };
const THEME_INTRO = {
  history: { ar: 'في هذه الجولة نتتبع تاريخ المدينة، من قلعة الطين التي انطلق منها توحيد المملكة إلى عاصمة الدولة السعودية الأولى في الدرعية.', en: 'This tour follows the city\'s history, from the mud fort where the unification began to Diriyah, capital of the first Saudi state.', fr: 'Cette visite suit l\'histoire de la ville, du fort de terre où commença l\'unification jusqu\'à Diriyah, capitale du premier État saoudien.', es: 'Este recorrido sigue la historia de la ciudad, desde el fuerte de adobe donde empezó la unificación hasta Diriyah, capital del primer Estado saudí.', de: 'Dieser Rundgang folgt der Geschichte der Stadt, von der Lehmfestung, mit der die Einigung begann, bis nach Diriyah, der Hauptstadt des ersten saudischen Staates.', zh: '这条路线追溯城市的历史，从开启统一大业的泥砖城堡，到第一沙特国的首都德拉伊耶。' },
  towers: { ar: 'في هذه الجولة نحلّق فوق أبراج الرياض، من برج التلفزيون إلى أعلى مباني المدينة في المركز المالي.', en: 'This tour flies over Riyadh\'s towers, from the TV tower to the tallest building in the city, in the financial district.', fr: 'Cette visite survole les tours de Riyad, de la tour de télévision au plus haut bâtiment de la ville, dans le quartier financier.', es: 'Este recorrido sobrevuela las torres de Riad, desde la torre de televisión hasta el edificio más alto de la ciudad, en el distrito financiero.', de: 'Dieser Rundgang führt über die Türme Riads, vom Fernsehturm bis zum höchsten Gebäude der Stadt im Finanzdistrikt.', zh: '这条路线飞越利雅得的高楼，从电视塔一直到金融区的全城最高建筑。' },
  market: { ar: 'في هذه الجولة نزور أسواق الرياض الشعبية وأشهر أماكن المطاعم والتنزه، من سوق الزل إلى الدرعية.', en: 'This tour visits Riyadh\'s traditional markets and its favourite places to eat and stroll, from Souq Al-Zal to Diriyah.', fr: 'Cette visite passe par les marchés traditionnels de Riyad et ses lieux préférés pour manger et flâner, du souk Al-Zal à Diriyah.', es: 'Este recorrido visita los mercados tradicionales de Riad y sus lugares favoritos para comer y pasear, del zoco Al-Zal a Diriyah.', de: 'Dieser Rundgang führt zu den traditionellen Märkten Riads und zu den beliebtesten Orten zum Essen und Bummeln, vom Souk Al-Zal bis nach Diriyah.', zh: '这条路线走访利雅得的传统市场和最受欢迎的美食与休闲去处，从扎尔市场一直到德拉伊耶。' },
  culture: { ar: 'في هذه الجولة نزور أشهر مباني الرياض تصميماً، وأماكن ثقافتها وحياتها اليومية.', en: 'This tour visits Riyadh\'s most striking buildings and the places where its culture and daily life happen.', fr: 'Cette visite parcourt les bâtiments les plus marquants de Riyad et les lieux de sa culture et de sa vie quotidienne.', es: 'Este recorrido visita los edificios más llamativos de Riad y los lugares de su cultura y su vida diaria.', de: 'Dieser Rundgang besucht die markantesten Gebäude Riads und die Orte seiner Kultur und seines Alltags.', zh: '这条路线走访利雅得最具特色的建筑，以及城市文化与日常生活的场所。' }
};
// the short tour keeps the first two sentences of each story
const firstSentence = (t) => (t.match(/^(?:.*?(?:[。؟]|[.!?](?=\s|$))){1,2}/) || [t])[0].trim();

// ---- your own tour: every landmark to pick from, a note on each before it is added, then the best order
const C = {
  ar: { ready: 'جولة جاهزة', custom: 'صمّم جولتك بنفسك', search: 'ابحث عن معلم…', add: 'أضف إلى جولتك', added: 'في جولتك ✓', remove: 'احذف', up: 'قدّم', route: 'مسار جولتك', empty: 'اضغط على أي معلم لتقرأ نبذة عنه، ثم أضفه إلى جولتك.', best: 'اقترح مساراً محسّناً', fly: 'جولة جوية', drive: 'قيادة على المسار', road: 'بالطرق', approx: 'تقريباً', km: 'كم', min: 'دقيقة قيادة', planning: 'جارٍ حساب أفضل ترتيب على الطرق…', ordered: 'رتّبنا المحطات في مسار محسّن يبدأ من موقعك. المسافات والأوقات تقديرية.', clear: 'مسح الكل', all: 'الكل', from: 'من موقعك' },
  en: { ready: 'Ready-made tour', custom: 'Design your own', search: 'Search landmarks…', add: 'Add to my tour', added: 'In my tour ✓', remove: 'Remove', up: 'Move up', route: 'My route', empty: 'Tap any landmark to read about it, then add it to your tour.', best: 'Suggest an optimised route', fly: 'Flying tour', drive: 'Drive the route', road: 'by road', approx: 'roughly', km: 'km', min: 'min driving', planning: 'Working out the best order on the roads…', ordered: 'Stops ordered into an optimised route from where you are. Distances and times are estimates.', clear: 'Clear', all: 'All', from: 'from you' },
  fr: { ready: 'Visite prête', custom: 'Composez la vôtre', search: 'Chercher un lieu…', add: 'Ajouter à ma visite', added: 'Dans ma visite ✓', remove: 'Retirer', up: 'Monter', route: 'Mon itinéraire', empty: 'Touchez un lieu pour lire sa présentation, puis ajoutez-le.', best: 'Proposer un itinéraire optimisé', fly: 'Visite aérienne', drive: 'Conduire l\'itinéraire', road: 'par la route', approx: 'environ', km: 'km', min: 'min de route', planning: 'Calcul du meilleur ordre sur les routes…', ordered: 'Étapes classées en un itinéraire optimisé depuis votre position. Distances et durées estimées.', clear: 'Tout effacer', all: 'Tout', from: 'depuis vous' },
  es: { ready: 'Recorrido listo', custom: 'Diseñe el suyo', search: 'Buscar un lugar…', add: 'Añadir a mi recorrido', added: 'En mi recorrido ✓', remove: 'Quitar', up: 'Subir', route: 'Mi ruta', empty: 'Toque un lugar para leer sobre él y luego añádalo.', best: 'Sugerir una ruta optimizada', fly: 'Recorrido aéreo', drive: 'Conducir la ruta', road: 'por carretera', approx: 'aprox.', km: 'km', min: 'min en coche', planning: 'Calculando el mejor orden por carretera…', ordered: 'Paradas ordenadas en una ruta optimizada desde donde está. Distancias y tiempos estimados.', clear: 'Borrar todo', all: 'Todo', from: 'desde usted' },
  de: { ready: 'Fertiger Rundgang', custom: 'Eigenen planen', search: 'Ort suchen…', add: 'Zum Rundgang', added: 'Im Rundgang ✓', remove: 'Entfernen', up: 'Nach oben', route: 'Meine Route', empty: 'Tippen Sie auf einen Ort, um mehr zu lesen, und fügen Sie ihn dann hinzu.', best: 'Optimierte Route vorschlagen', fly: 'Rundflug', drive: 'Route fahren', road: 'auf der Straße', approx: 'etwa', km: 'km', min: 'Min. Fahrt', planning: 'Beste Reihenfolge auf den Straßen wird berechnet…', ordered: 'Stationen zu einer optimierten Route ab Ihrem Standort geordnet. Entfernungen und Zeiten sind Schätzungen.', clear: 'Alles löschen', all: 'Alle', from: 'ab Ihnen' },
  zh: { ready: '推荐路线', custom: '自定义游览', search: '搜索景点…', add: '加入我的游览', added: '已加入 ✓', remove: '移除', up: '上移', route: '我的路线', empty: '点击任意景点查看介绍，然后加入游览。', best: '推荐优化路线', fly: '空中游览', drive: '驾车游览', road: '按道路', approx: '约', km: '公里', min: '分钟车程', planning: '正在按道路计算最佳顺序…', ordered: '已按从您所在位置出发的优化路线排序。距离和时间为估算。', clear: '清空', all: '全部', from: '从您这里' }
};
const CUSTOM_INTRO = { ar: 'في هذه الجولة نزور المحطات التي اخترتها بنفسك.', en: 'On this tour we visit the stops you chose yourself.', fr: 'Cette visite passe par les étapes que vous avez choisies.', es: 'En este recorrido visitamos las paradas que usted eligió.', de: 'Dieser Rundgang führt zu den Stationen, die Sie selbst gewählt haben.', zh: '这次游览将前往您亲自挑选的站点。' };
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const arrowTo = (a, b) => ARROWS[Math.round(((Math.atan2(b.x - a.x, -(b.z - a.z)) / (Math.PI * 2)) * 8 + 8)) % 8];
// a short open path from the start (index 0) through every other point: nearest neighbour, then 2-opt and
// single-stop moves until nothing shortens it. A heuristic, so the result is optimised, not proven shortest.
// D may be asymmetric (one-way streets).
export function bestPath(D) {
  const n = D.length, left = new Set(Array.from({ length: n - 1 }, (_, i) => i + 1));
  let p = [0];
  while (left.size) { const a = p[p.length - 1]; let b = -1; for (const j of left) if (b < 0 || D[a][j] < D[a][b]) b = j; p.push(b); left.delete(b); }
  const cost = (q) => { let c = 0; for (let k = 1; k < q.length; k++) c += D[q[k - 1]][q[k]]; return c; };
  let best = cost(p), better = true;
  for (let pass = 0; better && pass < 60; pass++) {
    better = false;
    for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const q = p.slice(0, i).concat(p.slice(i, j + 1).reverse(), p.slice(j + 1)), c = cost(q);
      if (c < best - 1e-6) { p = q; best = c; better = true; }
    }
    for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
      if (i === j) continue;
      const q = p.slice(); const [x] = q.splice(i, 1); q.splice(j, 0, x);
      const c = cost(q);
      if (c < best - 1e-6) { p = q; best = c; better = true; }
    }
  }
  return p.slice(1);
}

const CSS = `
#tour-panel { position: fixed; z-index: 25; left: 0; right: 0; margin: 0 auto; width: min(560px, calc(100vw - 24px)); box-sizing: border-box; max-height: 86vh; max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); overflow-y: auto; bottom: calc(env(safe-area-inset-bottom, 0px) + 16px); background: rgba(20,16,12,0.9); color: #fbf6ec; border: 1px solid rgba(243,215,154,0.35); border-radius: 14px; padding: 12px 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.45); backdrop-filter: blur(10px); }
#tour-panel .top { display: flex; align-items: center; gap: 8px; }
#tour-panel .top b { font-size: 16px; white-space: nowrap; } #tour-panel .top small { white-space: nowrap; }
@media (max-width: 440px) { #tour-panel .top b:not(.keep) { display: none; } #tour-panel .tb { min-width: 38px; padding: 0 8px; } } #tour-panel .top small { opacity: .7; font-size: 12px; }
#tour-panel .top .sp { flex: 1; }
#tour-panel select { height: 34px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: #2a231b; color: #fbf6ec; font: inherit; font-size: 13px; padding: 0 6px; }
#tour-panel .tb { height: 34px; min-width: 34px; padding: 0 10px; border-radius: 8px; border: 0; background: rgba(255,255,255,0.1); color: #fbf6ec; font: inherit; font-size: 13px; cursor: pointer; }
#tour-panel .tb.go { background: #1f9d63; color: #fff; }
#tour-panel .cap { margin-top: 10px; font-size: 15px; line-height: 1.7; min-height: 3.4em; }
#tour-panel .cap h4 { margin: 0 0 2px; color: #f3d79a; font-size: 17px; }
#tour-panel .bar { height: 3px; border-radius: 3px; background: rgba(255,255,255,0.12); margin-top: 8px; overflow: hidden; } #tour-panel .bar i { display: block; height: 100%; width: 0; background: #f3d79a; }
#tour-panel .note { font-size: 11.5px; opacity: .7; margin-top: 4px; }
#tour-panel .setup { display: grid; gap: 8px; margin-top: 8px; }
#tour-panel .lbl { font-size: 12px; opacity: .7; }
#tour-panel .opts { display: flex; flex-wrap: wrap; gap: 6px; }
#tour-panel .opt { height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.18); background: transparent; color: #fbf6ec; font: inherit; font-size: 13.5px; cursor: pointer; }
#tour-panel .opt[aria-pressed="true"] { background: #f3d79a; color: #2a1d10; border-color: #f3d79a; }
#tour-panel .plan { font-size: 13px; line-height: 1.8; opacity: .9; }
#tour-panel .plan b { color: #f3d79a; }
#tour-panel .go-row { display: flex; gap: 8px; }
#tour-panel .go-row .tb { height: 40px; font-size: 14px; }
#tour-panel .go-row .go { flex: 1; }
#tour-panel .go-row { flex-wrap: wrap; position: sticky; bottom: -12px; margin: 0 -2px -12px; padding: 6px 2px 12px; background: rgba(20,16,12,0.97); }
#tour-panel .go-row .alt { flex: 1; background: rgba(255,255,255,0.14); }
#tour-panel .cq { height: 36px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); color: #fbf6ec; font: inherit; font-size: 14px; padding: 0 12px; }
#tour-panel .opts.cats .opt { height: 30px; font-size: 12.5px; padding: 0 10px; }
#tour-panel .pick { display: grid; gap: 4px; max-height: 24vh; max-height: 24dvh; overflow-y: auto; overscroll-behavior: contain; }
#tour-panel .pk { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; background: rgba(255,255,255,0.05); border-radius: 9px; padding: 4px 4px 4px 8px; }
#tour-panel .pk.open { background: rgba(243,215,154,0.1); }
#tour-panel .pk-n { display: grid; text-align: start; background: none; border: 0; color: inherit; font: inherit; cursor: pointer; padding: 4px 2px; min-width: 0; }
#tour-panel .pk-n b { font-size: 14px; } #tour-panel .pk-n small { font-size: 11.5px; opacity: .65; }
#tour-panel .pk-a { height: 32px; min-width: 32px; border-radius: 8px; border: 1px solid rgba(243,215,154,0.5); background: transparent; color: #f3d79a; font: inherit; font-size: 13px; cursor: pointer; padding: 0 9px; }
#tour-panel .pk-a[aria-pressed="true"] { background: #1f9d63; border-color: #1f9d63; color: #fff; }
#tour-panel .pk-d { grid-column: 1 / -1; margin: 0 2px 6px; font-size: 13px; line-height: 1.7; opacity: .92; }
#tour-panel .pk-d .pk-a { margin-top: 6px; display: block; }
#tour-panel .route { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; max-height: 17vh; max-height: 17dvh; overflow-y: auto; }
#tour-panel .route li { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.06); border-radius: 8px; padding: 4px 6px; font-size: 13.5px; }
#tour-panel .route .n { width: 22px; height: 22px; border-radius: 50%; background: #f3d79a; color: #2a1d10; display: grid; place-items: center; font-size: 12px; font-weight: 700; flex: none; }
#tour-panel .route b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
#tour-panel .route small { opacity: .75; font-size: 12px; white-space: nowrap; }
#tour-panel .route button { width: 28px; height: 28px; border-radius: 7px; border: 0; background: rgba(255,255,255,0.1); color: #fbf6ec; cursor: pointer; flex: none; }
#tour-panel .hint { font-size: 13px; opacity: .75; line-height: 1.6; }
body.touring #touch-controls, body.touring .hud-bottom, body.touring #guide-nav { display: none !important; }
@media (pointer: coarse) and (orientation: portrait) { #tour-panel .cap { font-size: 14px; } }
`;
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

export class Tour {
  constructor({ camera, onEnd }) {
    this.camera = camera; this.onEnd = onEnd;
    this.active = false; this.paused = false; this.muted = false;
    this.speed = 1;
    this.narrator = true;
    try { this.narrator = localStorage.getItem('riyadh-narrator') !== 'off'; } catch (e) { /* private mode */ }
    try { this.speed = [1, 1.5, 2].includes(+localStorage.getItem('riyadh-tour-speed')) ? +localStorage.getItem('riyadh-tour-speed') : 1; } catch (e) { /* private mode */ }
    try { this.lang = localStorage.getItem('riyadh-tour-lang') || ''; } catch (e) { this.lang = ''; }
    if (!LANGS.find((l) => l.id === this.lang)) this.lang = (navigator.language || 'ar').slice(0, 2);
    if (!LANGS.find((l) => l.id === this.lang)) this.lang = 'en';
    this.all = STOPS.map(([key, h, text]) => ({ key, h, text, ...PLACES[key] })).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
    this.stops = this.all;
    this.theme = 'all'; this.dur = 'medium';
    this.spots = []; this.cats = {}; this.pick = []; this.mode = 'ready';
    try {
      this.mode = localStorage.getItem('riyadh-tour-mode') === 'custom' ? 'custom' : 'ready';
      const pk = JSON.parse(localStorage.getItem('riyadh-tour-pick') || '[]');
      if (Array.isArray(pk)) this.pick = pk.filter((k) => typeof k === 'string' && PLACES[k]);
    } catch (e) { /* private mode */ }
    try { this.theme = THEMES[localStorage.getItem('riyadh-tour-theme')] ? localStorage.getItem('riyadh-tour-theme') : 'all'; this.dur = DURS[localStorage.getItem('riyadh-tour-dur')] ? localStorage.getItem('riyadh-tour-dur') : 'medium'; } catch (e) { /* private mode */ }
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = document.createElement('div'); this.el.id = 'tour-panel'; this.el.hidden = true; document.body.appendChild(this.el);
    this.synth = window.speechSynthesis || null;
    this.synth?.getVoices();
    if (this.synth) this.synth.onvoiceschanged = () => this.synth.getVoices();
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
  }
  get ui() { return UI[this.lang]; }
  // a paused engine stays paused through cancel(): resume it first, or the next utterance is silent
  hush() { if (!this.synth) return; if (this.synth.paused) this.synth.resume(); this.synth.cancel(); }
  voiceFor(lang) {
    if (!this.synth) return null;
    const L = LANGS.find((l) => l.id === lang), vs = this.synth.getVoices();
    return vs.find((v) => v.lang === L.bcp) || vs.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang)) || null;
  }
  // ---- the narrator outside the tour: landmarks as you pass them, districts as you enter them
  setNarrator(on) {
    this.narrator = on;
    try { localStorage.setItem('riyadh-narrator', on ? 'on' : 'off'); } catch (e) { /* private mode */ }
    if (!on && !this.active) this.hush();
  }
  setLang(id) {
    if (!LANGS.find((l) => l.id === id)) return;
    this.lang = id;
    try { localStorage.setItem('riyadh-tour-lang', id); } catch (e) { /* private mode */ }
  }
  get dir() { return LANGS.find((l) => l.id === this.lang).dir; }
  storyFor(key) { const s = this.all.find((q) => q.key === key); return s ? s.text[this.lang] : null; }
  districtLine(d) { return DISTRICT[this.lang](d); }
  // interrupt: a landmark story replaces whatever is being said; a district name waits its turn
  speakFree(text, interrupt) {
    if (!this.synth || !this.narrator || this.active || !text) return false;
    if (!interrupt && (this.synth.speaking || this.synth.pending)) return false;
    this.hush();
    const L = LANGS.find((l) => l.id === this.lang), v = this.voiceFor(this.lang);
    for (const t of text.split(/(?<=[.!?。؟])\s*/).filter((x) => x.trim())) {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = L.bcp; if (v) u.voice = v; u.rate = 1.05;
      this.synth.speak(u);
    }
    return true;
  }
  // ---- planning: the theme's stops, trimmed to the most important ones for the length, kept in travelling order
  plan(theme = this.theme, dur = this.dur) {
    const keys = THEMES[theme], max = DURS[dur].max;
    const keep = new Set(keys.slice().sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b)).slice(0, max));
    return this.all.filter((s) => keep.has(s.key)).map((s) => ({ ...s, text: DURS[dur].brief ? Object.fromEntries(Object.entries(s.text).map(([l, t]) => [l, firstSentence(t)])) : s.text }));
  }
  intro() {
    if (this.custom) return Object.fromEntries(LANGS.map((l) => [l.id, WELCOME[l.id] + ' ' + CUSTOM_INTRO[l.id]]));
    if (this.theme === 'all') return INTRO;
    return Object.fromEntries(LANGS.map((l) => [l.id, WELCOME[l.id] + ' ' + THEME_INTRO[this.theme][l.id]]));
  }
  // minutes, from the same flight times and a speaking pace of about 11 characters a second
  estimate(stops) {
    const cps = this.lang === 'zh' ? 5.5 : 13, said = (t) => t[this.lang].length / cps;
    let x = this.from ? this.from.x : 0, z = this.from ? this.from.z : 0, sec = 0;
    stops.forEach((s, k) => {
      const fly = Math.min(9, Math.max(3.5, 2.5 + Math.hypot(s.x - x, s.z - z) / 1400));
      sec += k === 0 ? Math.max(fly, said(this.intro())) : fly;
      sec += Math.max(2.5, said(s.text)) + 0.8;
      x = s.x; z = s.z;
    });
    return Math.max(1, Math.round((sec + said(OUTRO)) / 60 / this.speed));
  }
  open(fromPos, fromLook) {
    this.from = fromPos.clone(); this.fromLook = fromLook.clone();
    if (this.el.hidden) this.opener = document.activeElement;
    this.phase = 'setup'; this.el.hidden = false;
    this.renderSetup();
    this.el.querySelector('[data-a="go"]')?.focus({ preventScroll: true });
  }
  modeTabs() {
    const c = C[this.lang];
    return `<div class="opts" role="group">${['ready', 'custom'].map((m) => `<button class="opt" type="button" data-mode="${m}" aria-pressed="${(this.mode || 'ready') === m}">${c[m]}</button>`).join('')}</div>`;
  }
  wireTabs() {
    this.el.querySelectorAll('[data-mode]').forEach((x) => (x.onclick = () => {
      this.mode = x.dataset.mode;
      try { localStorage.setItem('riyadh-tour-mode', this.mode); } catch (e) { /* private mode */ }
      this.renderSetup();
      this.el.querySelector(`[data-mode="${this.mode}"]`)?.focus({ preventScroll: true });
    }));
  }
  renderSetup() {
    if (this.mode === 'custom') { this.renderCustom(); return; }
    const u = this.ui, b = B[this.lang], L = LANGS.find((l) => l.id === this.lang);
    this.el.dir = L.dir;
    const stops = this.plan(), name = (s) => (this.lang === 'ar' ? s.ar : s.en);
    const sep = this.lang === 'ar' ? '، ' : this.lang === 'zh' ? '、' : ', ';
    this.el.innerHTML = `<div class="top"><b class="keep">${b.design}</b><span class="sp"></span>
      <select aria-label="${u.lang}">${LANGS.map((l) => `<option value="${l.id}"${l.id === this.lang ? ' selected' : ''}>${l.name}</option>`).join('')}</select>
      <button class="tb" data-a="cancel" type="button" title="${b.cancel}">✕</button></div>
      <div class="setup">
        ${this.modeTabs()}
        <div class="lbl">${b.theme}</div>
        <div class="opts" role="group" aria-label="${b.theme}">${Object.keys(THEMES).map((k) => `<button class="opt" type="button" data-theme-id="${k}" aria-pressed="${k === this.theme}">${b.themes[k]}</button>`).join('')}</div>
        <div class="lbl">${b.length}</div>
        <div class="opts" role="group" aria-label="${b.length}">${Object.keys(DURS).map((k) => `<button class="opt" type="button" data-dur="${k}" aria-pressed="${k === this.dur}">${b.durs[k]}</button>`).join('')}</div>
        <div class="plan"><b>${stops.length} ${b.stops} · ${b.about} ${this.estimate(stops)} ${b.min}</b><br>${esc(stops.map(name).join(sep))}</div>
        <div class="go-row"><button class="tb go" type="button" data-a="go">▶ ${b.go}</button></div>
      </div>`;
    const keep = () => { try { localStorage.setItem('riyadh-tour-theme', this.theme); localStorage.setItem('riyadh-tour-dur', this.dur); localStorage.setItem('riyadh-tour-lang', this.lang); } catch (e) { /* private mode */ } };
    this.el.querySelector('select').onchange = (e) => { this.lang = e.target.value; keep(); this.renderSetup(); };
    this.el.querySelectorAll('[data-theme-id]').forEach((x) => (x.onclick = () => { this.theme = x.dataset.themeId; keep(); this.renderSetup(); }));
    this.el.querySelectorAll('[data-dur]').forEach((x) => (x.onclick = () => { this.dur = x.dataset.dur; keep(); this.renderSetup(); }));
    this.el.querySelector('[data-a="cancel"]').onclick = () => { this.el.hidden = true; this.phase = null; if (this.opener && document.contains(this.opener)) this.opener.focus({ preventScroll: true }); };
    this.el.querySelector('[data-a="go"]').onclick = () => { this.custom = false; this.stops = this.plan(); this.start(this.from, this.fromLook); };
    this.wireTabs();
  }
  // ---- the custom tour builder
  spot(key) { return this.spots.find((g) => g.key === key); }
  textOf(key) {
    const s = this.all.find((q) => q.key === key);
    if (s) return s.text;
    const g = this.spot(key);
    return Object.fromEntries(LANGS.map((l) => [l.id, l.id === 'ar' ? g.desc : g.descEn || g.desc]));
  }
  stopFor(key) {
    const s = this.all.find((q) => q.key === key);
    if (s) return s;
    const g = this.spot(key);
    return { key, h: g.h, text: this.textOf(key), ...PLACES[key] };
  }
  savePick() { try { localStorage.setItem('riyadh-tour-pick', JSON.stringify(this.pick)); } catch (e) { /* private mode */ } }
  renderCustom() {
    const b = B[this.lang], c = C[this.lang], L = LANGS.find((l) => l.id === this.lang);
    this.el.dir = L.dir;
    this.pcat = this.pcat || 'all'; this.pq = this.pq || '';
    this.pick = this.pick.filter((k) => this.spot(k));
    this.el.innerHTML = `<div class="top"><b class="keep">${b.design}</b><span class="sp"></span>
      <select aria-label="${this.ui.lang}">${LANGS.map((l) => `<option value="${l.id}"${l.id === this.lang ? ' selected' : ''}>${l.name}</option>`).join('')}</select>
      <button class="tb" data-a="cancel" type="button" title="${b.cancel}">✕</button></div>
      <div class="setup">
        ${this.modeTabs()}
        <input class="cq" type="search" placeholder="${c.search}" aria-label="${c.search}" value="${esc(this.pq)}" autocomplete="off">
        <div class="opts cats" role="group">${Object.entries(this.cats).filter(([k]) => k === 'all' || this.spots.some((g) => g.cat === k)).map(([k, [ar, en]]) => `<button class="opt" type="button" data-pcat="${k}" aria-pressed="${k === this.pcat}">${k === 'all' ? c.all : this.lang === 'ar' ? ar : en}</button>`).join('')}</div>
        <div class="pick"></div>
        <div class="lbl rl"></div>
        <ol class="route"></ol>
        <div class="plan"></div>
        <div class="go-row">
          <button class="tb alt" type="button" data-a="best">⇅ ${c.best}</button>
          <button class="tb go" type="button" data-a="fly">▶ ${c.fly}</button>
          <button class="tb go" type="button" data-a="drive">🚗 ${c.drive}</button>
        </div>
      </div>`;
    this.el.querySelector('select').onchange = (e) => { this.lang = e.target.value; try { localStorage.setItem('riyadh-tour-lang', this.lang); } catch (err) { /* private mode */ } this.renderCustom(); };
    this.el.querySelector('[data-a="cancel"]').onclick = () => { this.el.hidden = true; this.phase = null; if (this.opener && document.contains(this.opener)) this.opener.focus({ preventScroll: true }); };
    const q = this.el.querySelector('.cq');
    q.oninput = () => { this.pq = q.value; this.fillPick(); };
    q.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') this.el.querySelector('[data-a="cancel"]').click(); };   // typing must not drive the car
    this.el.querySelectorAll('[data-pcat]').forEach((x) => (x.onclick = () => {
      this.pcat = x.dataset.pcat;
      this.el.querySelectorAll('[data-pcat]').forEach((y) => y.setAttribute('aria-pressed', y === x));
      this.fillPick();
    }));
    // one listener for the list and the route: open a note, add or remove a stop, move it up
    this.el.querySelector('.setup').onclick = (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.info) { this.pOpen = this.pOpen === t.dataset.info ? null : t.dataset.info; this.fillPick(t.dataset.info); }
      else if (t.dataset.add) { const k = t.dataset.add, i = this.pick.indexOf(k); if (i < 0) this.pick.push(k); else this.pick.splice(i, 1); this.legs = null; this.savePick(); this.fillPick(k); this.fillRoute(); }
      else if (t.dataset.rm) { this.pick.splice(+t.dataset.rm, 1); this.legs = null; this.savePick(); this.fillPick(); this.fillRoute(); }
      else if (t.dataset.up) { const i = +t.dataset.up; if (i > 0) { [this.pick[i - 1], this.pick[i]] = [this.pick[i], this.pick[i - 1]]; this.legs = null; this.savePick(); this.fillRoute(); this.el.querySelector(`[data-up="${i - 1}"]`)?.focus({ preventScroll: true }); } }
    };
    this.el.querySelector('[data-a="best"]').onclick = () => this.bestOrder();
    this.el.querySelector('[data-a="fly"]').onclick = () => {
      if (!this.pick.length) return;
      this.custom = true; this.stops = this.pick.map((k) => this.stopFor(k)); this.start(this.from, this.fromLook);
    };
    this.el.querySelector('[data-a="drive"]').onclick = () => {
      if (!this.pick.length) return;
      this.el.hidden = true; this.phase = null;
      this.onDrive?.(this.pick.slice());
    };
    this.wireTabs();
    this.fillPick(); this.fillRoute();
  }
  fillPick(keep) {
    const c = C[this.lang], box = this.el.querySelector('.pick'); if (!box) return;
    const top = box.scrollTop, q = this.pq.trim().toLowerCase(), f = this.from;
    const name = (g) => (this.lang === 'ar' ? g.ar : g.en);
    const items = this.spots.filter((g) => (this.pcat === 'all' || g.cat === this.pcat) && (!q || (g.ar + ' ' + g.en).toLowerCase().includes(q)))
      .sort((a, b) => (a.rank || 99) - (b.rank || 99));
    box.innerHTML = items.map((g) => {
      const on = this.pick.includes(g.key), open = this.pOpen === g.key, d = Math.hypot(g.x - f.x, g.z - f.z) / 1000;
      const cat = this.cats[g.cat] ? (this.lang === 'ar' ? this.cats[g.cat][0] : this.cats[g.cat][1]) : '';
      return `<div class="pk${open ? ' open' : ''}"><button class="pk-n" type="button" data-info="${g.key}" aria-expanded="${open}"><b>${esc(name(g))}</b><small>${esc(cat)} · ${d.toFixed(d < 10 ? 1 : 0)} ${c.km}</small></button>
        <button class="pk-a" type="button" data-add="${g.key}" aria-pressed="${on}" aria-label="${on ? c.remove : c.add}: ${esc(name(g))}">${on ? '✓' : '+'}</button>
        ${open ? `<p class="pk-d">${esc(this.textOf(g.key)[this.lang])}<button class="pk-a" type="button" data-add="${g.key}" aria-pressed="${on}">${on ? c.added : c.add}</button></p>` : ''}</div>`;
    }).join('');
    box.scrollTop = top;
    if (keep) box.querySelector(`[data-info="${keep}"]`)?.focus({ preventScroll: true });
  }
  fillRoute() {
    const c = C[this.lang], ol = this.el.querySelector('.route'); if (!ol) return;
    const name = (k) => PLACES[k][this.lang === 'ar' ? 'ar' : 'en'];
    this.el.querySelector('.rl').textContent = `${c.route} (${this.pick.length})`;
    let prev = this.from, sum = 0;
    const road = this.legs && this.legs.length === this.pick.length;
    ol.innerHTML = this.pick.map((k, i) => {
      const s = PLACES[k], leg = road ? this.legs[i] : Math.hypot(s.x - prev.x, s.z - prev.z) * 1.3;
      sum += leg;
      const html = `<li><span class="n">${i + 1}</span><b>${esc(name(k))}</b><small>${arrowTo(prev, s)} ${(leg / 1000).toFixed(1)} ${c.km}</small>
        <button type="button" data-up="${i}" title="${c.up}" aria-label="${c.up}: ${esc(name(k))}"${i ? '' : ' disabled'}>↑</button><button type="button" data-rm="${i}" title="${c.remove}" aria-label="${c.remove}: ${esc(name(k))}">✕</button></li>`;
      prev = s;
      return html;
    }).join('');
    const plan = this.el.querySelector('.plan');
    if (!this.pick.length) { plan.innerHTML = `<span class="hint">${c.empty}</span>`; }
    else {
      const km = sum / 1000, mins = Math.max(1, Math.round(km / 32 * 60));
      const b = B[this.lang];
      plan.innerHTML = `<b>🚗 ${km.toFixed(1)} ${c.km} ${road ? c.road : c.approx} · ${mins} ${c.min}</b> · ✈ ${c.fly} ${b.about} ${this.estimate(this.pick.map((k) => this.stopFor(k)))} ${b.min}${this.orderNote ? `<br>${this.orderNote}` : ''}`;
    }
    this.el.querySelectorAll('[data-a="fly"], [data-a="drive"], [data-a="best"]').forEach((x) => (x.disabled = !this.pick.length || this.planning));
  }
  // order the stops into a short trip from here, on the real roads when the road network loads
  async bestOrder() {
    if (this.planning || !this.pick.length) return;
    const c = C[this.lang], st = this.pick.map((k) => PLACES[k]), pts = [this.from, ...st], n = pts.length;
    this.planning = true; this.orderNote = c.planning; this.fillRoute();
    let road = false;
    try { road = !!(this.roads && n <= 19 && (await this.roads.ready())); } catch (e) { road = false; }
    const D = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 1; j < n; j++) {
        if (i === j) continue;
        const line = Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z);
        const r = road ? this.roads.len(pts[i], pts[j]) : null;
        D[i][j] = r != null ? r : line * 1.35;
      }
      if (road) await new Promise((res) => setTimeout(res));   // keep the page responsive
    }
    const order = bestPath(D);
    const keys = this.pick.slice();
    this.pick = order.map((i) => keys[i - 1]);
    this.legs = order.map((i, k) => D[k ? order[k - 1] : 0][i]);
    if (!road) this.legs = null;
    this.planning = false; this.orderNote = c.ordered;
    this.savePick();
    if (this.phase === 'setup' && this.mode === 'custom') { this.fillPick(); this.fillRoute(); }
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
      <button class="tb" data-a="speed" type="button" title="${this.speed}x" aria-label="${this.speed}x">×${this.speed}</button>
      <button class="tb" data-a="next" type="button" title="${u.next}">⏭</button>
      <button class="tb" data-a="end" type="button" title="${u.end}">✕</button></div>
      <div class="cap"><h4>${esc(stopName)}</h4><span class="txt"></span></div><div class="bar"><i></i></div>
      ${!this.muted && this.synth && !this.voiceFor(this.lang) ? `<div class="note">${u.noVoice}</div>` : ''}`;
    this.el.querySelector('select').onchange = (e) => {
      this.lang = e.target.value;
      try { localStorage.setItem('riyadh-tour-lang', this.lang); } catch (err) { /* private mode */ }
      this.say(this.caption);   // repeat the current part in the new language
    };
    this.el.querySelector('[data-a="mute"]').onclick = () => { this.muted = !this.muted; if (this.muted) this.hush(); else this.say(this.caption); };
    this.el.querySelector('[data-a="pause"]').onclick = () => { this.paused = !this.paused; if (this.paused) this.synth?.pause(); else this.synth?.resume(); this.render(); this.setText(); };
    this.el.querySelector('[data-a="next"]').onclick = () => this.advance();
    // ×1 → ×1.5 → ×2: faster flights, shorter pauses and a quicker narrator (from the next sentence)
    this.el.querySelector('[data-a="speed"]').onclick = () => {
      this.speed = this.speed === 1 ? 1.5 : this.speed === 1.5 ? 2 : 1;
      try { localStorage.setItem('riyadh-tour-speed', this.speed); } catch (e) { /* private mode */ }
      this.render(); this.setText();
    };
    this.el.querySelector('[data-a="end"]').onclick = () => this.stop();
    this.setText();
  }
  setText() { const t = this.el.querySelector('.txt'); if (t && this.caption) t.textContent = this.caption[this.lang]; }
  // ---- narration
  say(text) {
    this.caption = text;
    this.paused = false;   // a new line (a language change, sound back on) also resumes the tour
    this.render();
    this.spoken = false; this.sayT = 0;
    // without a voice, hold the subtitle for a reading time
    this.minHold = Math.max(4, text[this.lang].length / (this.lang === 'zh' ? 6 : 18));
    this.hush();
    if (!this.synth || this.muted) { this.spoken = true; return; }
    // one utterance per sentence: some browsers cut long utterances off after about 15 seconds
    const parts = text[this.lang].split(/(?<=[.!?。؟])\s*/).filter((t) => t.trim());
    const L = LANGS.find((l) => l.id === this.lang), v = this.voiceFor(this.lang);
    this.talking = true;
    const token = (this.token = {});
    parts.forEach((t, k) => {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = L.bcp; if (v) u.voice = v; u.rate = Math.min(2, 1.05 * this.speed);
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
    this.say(this.intro());
  }
  stop(finished) {
    if (!this.active) return;
    this.active = false; this.hush(); this.token = null;
    this.el.hidden = true; document.body.classList.remove('touring');
    this.onEnd?.(this.stops[Math.min(this.i, this.stops.length - 1)], finished);
  }
  orbitFor(s) {
    if (VIEW[s.key]) return VIEW[s.key];
    const r = Math.max(110, s.h * 1.15), y = Math.max(45, s.h * 0.55 + 30); return { r, y, ly: Math.max(8, s.h * 0.45) };
  }
  beginFlight(s) {
    const o = this.orbitFor(s);
    this.fly = { t: 0, p0: this.pos.clone(), l0: this.look.clone(), s, o };
    const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
    this.fly.T = Math.min(9, Math.max(3.5, 2.5 + d / 1400));
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
    dt *= this.speed;
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
    const hold = this.muted || !this.synth ? this.minHold : Math.max(2.5, this.minHold * 0.3);
    if (bar) bar.style.width = Math.min(100, (this.sayT / (hold + 2)) * 100).toFixed(1) + '%';
    if (this.spoken && this.sayT > hold && !this.talking) {
      this.waitT = (this.waitT || 0) + dt;
      if (this.waitT > 0.8) { this.waitT = 0; this.advance(); }
    }
  }
}
