// Static reference dataset: all 81 Turkish provinces (il) and their districts (ilçe).
// Province plate order (1 Adana … 81 Düzce). Canonical Turkish spelling throughout.
// Pure data + one lookup function. No imports, no side effects. UTF-8.
//
// Consumed by src/app/(os)/harita/page.tsx for province/district cascade selects.
// Slug fold matches src/lib/geo.ts slugify: İ→i, ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c,
// lowercase, spaces→-.

export interface TrProvince {
  /** Canonical Turkish spelling, e.g. "İstanbul", "Şanlıurfa", "Çanakkale". */
  name: string
  /** ASCII slug matching the project's slugify. */
  slug: string
  /** All official districts (ilçe) of that province, canonical Turkish spelling. */
  districts: string[]
}

export const TR_PROVINCES: TrProvince[] = [
  {
    name: 'Adana',
    slug: 'adana',
    districts: [
      'Aladağ', 'Ceyhan', 'Çukurova', 'Feke', 'İmamoğlu', 'Karaisalı', 'Karataş',
      'Kozan', 'Pozantı', 'Saimbeyli', 'Sarıçam', 'Seyhan', 'Tufanbeyli',
      'Yumurtalık', 'Yüreğir',
    ],
  },
  {
    name: 'Adıyaman',
    slug: 'adiyaman',
    districts: [
      'Besni', 'Çelikhan', 'Gerger', 'Gölbaşı', 'Kahta', 'Merkez', 'Samsat',
      'Sincik', 'Tut',
    ],
  },
  {
    name: 'Afyonkarahisar',
    slug: 'afyonkarahisar',
    districts: [
      'Başmakçı', 'Bayat', 'Bolvadin', 'Çay', 'Çobanlar', 'Dazkırı', 'Dinar',
      'Emirdağ', 'Evciler', 'Hocalar', 'İhsaniye', 'İscehisar', 'Kızılören',
      'Merkez', 'Sandıklı', 'Sinanpaşa', 'Sultandağı', 'Şuhut',
    ],
  },
  {
    name: 'Ağrı',
    slug: 'agri',
    districts: [
      'Diyadin', 'Doğubayazıt', 'Eleşkirt', 'Hamur', 'Merkez', 'Patnos',
      'Taşlıçay', 'Tutak',
    ],
  },
  {
    name: 'Amasya',
    slug: 'amasya',
    districts: [
      'Göynücek', 'Gümüşhacıköy', 'Hamamözü', 'Merkez', 'Merzifon', 'Suluova',
      'Taşova',
    ],
  },
  {
    name: 'Ankara',
    slug: 'ankara',
    districts: [
      'Akyurt', 'Altındağ', 'Ayaş', 'Bala', 'Beypazarı', 'Çamlıdere', 'Çankaya',
      'Çubuk', 'Elmadağ', 'Etimesgut', 'Evren', 'Gölbaşı', 'Güdül', 'Haymana',
      'Kalecik', 'Kahramankazan', 'Keçiören', 'Kızılcahamam', 'Mamak', 'Nallıhan',
      'Polatlı', 'Pursaklar', 'Sincan', 'Şereflikoçhisar', 'Yenimahalle',
    ],
  },
  {
    name: 'Antalya',
    slug: 'antalya',
    districts: [
      'Akseki', 'Aksu', 'Alanya', 'Demre', 'Döşemealtı', 'Elmalı', 'Finike',
      'Gazipaşa', 'Gündoğmuş', 'İbradı', 'Kaş', 'Kemer', 'Kepez', 'Konyaaltı',
      'Korkuteli', 'Kumluca', 'Manavgat', 'Muratpaşa', 'Serik',
    ],
  },
  {
    name: 'Artvin',
    slug: 'artvin',
    districts: [
      'Ardanuç', 'Arhavi', 'Borçka', 'Hopa', 'Kemalpaşa', 'Merkez', 'Murgul',
      'Şavşat', 'Yusufeli',
    ],
  },
  {
    name: 'Aydın',
    slug: 'aydin',
    districts: [
      'Bozdoğan', 'Buharkent', 'Çine', 'Didim', 'Efeler', 'Germencik', 'İncirliova',
      'Karacasu', 'Karpuzlu', 'Koçarlı', 'Köşk', 'Kuşadası', 'Kuyucak', 'Nazilli',
      'Söke', 'Sultanhisar', 'Yenipazar',
    ],
  },
  {
    name: 'Balıkesir',
    slug: 'balikesir',
    districts: [
      'Altıeylül', 'Ayvalık', 'Balya', 'Bandırma', 'Bigadiç', 'Burhaniye',
      'Dursunbey', 'Edremit', 'Erdek', 'Gömeç', 'Gönen', 'Havran', 'İvrindi',
      'Karesi', 'Kepsut', 'Manyas', 'Marmara', 'Savaştepe', 'Sındırgı', 'Susurluk',
    ],
  },
  {
    name: 'Bilecik',
    slug: 'bilecik',
    districts: [
      'Bozüyük', 'Gölpazarı', 'İnhisar', 'Merkez', 'Osmaneli', 'Pazaryeri',
      'Söğüt', 'Yenipazar',
    ],
  },
  {
    name: 'Bingöl',
    slug: 'bingol',
    districts: [
      'Adaklı', 'Genç', 'Karlıova', 'Kiğı', 'Merkez', 'Solhan', 'Yayladere',
      'Yedisu',
    ],
  },
  {
    name: 'Bitlis',
    slug: 'bitlis',
    districts: [
      'Adilcevaz', 'Ahlat', 'Güroymak', 'Hizan', 'Merkez', 'Mutki', 'Tatvan',
    ],
  },
  {
    name: 'Bolu',
    slug: 'bolu',
    districts: [
      'Dörtdivan', 'Gerede', 'Göynük', 'Kıbrıscık', 'Mengen', 'Merkez', 'Mudurnu',
      'Seben', 'Yeniçağa',
    ],
  },
  {
    name: 'Burdur',
    slug: 'burdur',
    districts: [
      'Ağlasun', 'Altınyayla', 'Bucak', 'Çavdır', 'Çeltikçi', 'Gölhisar',
      'Karamanlı', 'Kemer', 'Merkez', 'Tefenni', 'Yeşilova',
    ],
  },
  {
    name: 'Bursa',
    slug: 'bursa',
    districts: [
      'Büyükorhan', 'Gemlik', 'Gürsu', 'Harmancık', 'İnegöl', 'İznik', 'Karacabey',
      'Keles', 'Kestel', 'Mudanya', 'Mustafakemalpaşa', 'Nilüfer', 'Orhaneli',
      'Orhangazi', 'Osmangazi', 'Yenişehir', 'Yıldırım',
    ],
  },
  {
    name: 'Çanakkale',
    slug: 'canakkale',
    districts: [
      'Ayvacık', 'Bayramiç', 'Biga', 'Bozcaada', 'Çan', 'Eceabat', 'Ezine',
      'Gelibolu', 'Gökçeada', 'Lapseki', 'Merkez', 'Yenice',
    ],
  },
  {
    name: 'Çankırı',
    slug: 'cankiri',
    districts: [
      'Atkaracalar', 'Bayramören', 'Çerkeş', 'Eldivan', 'Ilgaz', 'Kızılırmak',
      'Korgun', 'Kurşunlu', 'Merkez', 'Orta', 'Şabanözü', 'Yapraklı',
    ],
  },
  {
    name: 'Çorum',
    slug: 'corum',
    districts: [
      'Alaca', 'Bayat', 'Boğazkale', 'Dodurga', 'İskilip', 'Kargı', 'Laçin',
      'Mecitözü', 'Merkez', 'Oğuzlar', 'Ortaköy', 'Osmancık', 'Sungurlu', 'Uğurludağ',
    ],
  },
  {
    name: 'Denizli',
    slug: 'denizli',
    districts: [
      'Acıpayam', 'Babadağ', 'Baklan', 'Bekilli', 'Beyağaç', 'Bozkurt', 'Buldan',
      'Çal', 'Çameli', 'Çardak', 'Çivril', 'Güney', 'Honaz', 'Kale', 'Merkezefendi',
      'Pamukkale', 'Sarayköy', 'Serinhisar', 'Tavas',
    ],
  },
  {
    name: 'Diyarbakır',
    slug: 'diyarbakir',
    districts: [
      'Bağlar', 'Bismil', 'Çermik', 'Çınar', 'Çüngüş', 'Dicle', 'Eğil', 'Ergani',
      'Hani', 'Hazro', 'Kayapınar', 'Kocaköy', 'Kulp', 'Lice', 'Silvan', 'Sur',
      'Yenişehir',
    ],
  },
  {
    name: 'Edirne',
    slug: 'edirne',
    districts: [
      'Enez', 'Havsa', 'İpsala', 'Keşan', 'Lalapaşa', 'Meriç', 'Merkez', 'Süloğlu',
      'Uzunköprü',
    ],
  },
  {
    name: 'Elazığ',
    slug: 'elazig',
    districts: [
      'Ağın', 'Alacakaya', 'Arıcak', 'Baskil', 'Karakoçan', 'Keban', 'Kovancılar',
      'Maden', 'Merkez', 'Palu', 'Sivrice',
    ],
  },
  {
    name: 'Erzincan',
    slug: 'erzincan',
    districts: [
      'Çayırlı', 'İliç', 'Kemah', 'Kemaliye', 'Merkez', 'Otlukbeli', 'Refahiye',
      'Tercan', 'Üzümlü',
    ],
  },
  {
    name: 'Erzurum',
    slug: 'erzurum',
    districts: [
      'Aşkale', 'Aziziye', 'Çat', 'Hınıs', 'Horasan', 'İspir', 'Karaçoban',
      'Karayazı', 'Köprüköy', 'Narman', 'Oltu', 'Olur', 'Palandöken', 'Pasinler',
      'Pazaryolu', 'Şenkaya', 'Tekman', 'Tortum', 'Uzundere', 'Yakutiye',
    ],
  },
  {
    name: 'Eskişehir',
    slug: 'eskisehir',
    districts: [
      'Alpu', 'Beylikova', 'Çifteler', 'Günyüzü', 'Han', 'İnönü', 'Mahmudiye',
      'Mihalgazi', 'Mihalıççık', 'Odunpazarı', 'Sarıcakaya', 'Seyitgazi', 'Sivrihisar',
      'Tepebaşı',
    ],
  },
  {
    name: 'Gaziantep',
    slug: 'gaziantep',
    districts: [
      'Araban', 'İslahiye', 'Karkamış', 'Nizip', 'Nurdağı', 'Oğuzeli', 'Şahinbey',
      'Şehitkamil', 'Yavuzeli',
    ],
  },
  {
    name: 'Giresun',
    slug: 'giresun',
    districts: [
      'Alucra', 'Bulancak', 'Çamoluk', 'Çanakçı', 'Dereli', 'Doğankent', 'Espiye',
      'Eynesil', 'Görele', 'Güce', 'Keşap', 'Merkez', 'Piraziz', 'Şebinkarahisar',
      'Tirebolu', 'Yağlıdere',
    ],
  },
  {
    name: 'Gümüşhane',
    slug: 'gumushane',
    districts: [
      'Kelkit', 'Köse', 'Kürtün', 'Merkez', 'Şiran', 'Torul',
    ],
  },
  {
    name: 'Hakkari',
    slug: 'hakkari',
    districts: [
      'Çukurca', 'Derecik', 'Merkez', 'Şemdinli', 'Yüksekova',
    ],
  },
  {
    name: 'Hatay',
    slug: 'hatay',
    districts: [
      'Altınözü', 'Antakya', 'Arsuz', 'Belen', 'Defne', 'Dörtyol', 'Erzin',
      'Hassa', 'İskenderun', 'Kırıkhan', 'Kumlu', 'Payas', 'Reyhanlı', 'Samandağ',
      'Yayladağı',
    ],
  },
  {
    name: 'Isparta',
    slug: 'isparta',
    districts: [
      'Aksu', 'Atabey', 'Eğirdir', 'Gelendost', 'Gönen', 'Keçiborlu', 'Merkez',
      'Senirkent', 'Sütçüler', 'Şarkikaraağaç', 'Uluborlu', 'Yalvaç', 'Yenişarbademli',
    ],
  },
  {
    name: 'Mersin',
    slug: 'mersin',
    districts: [
      'Akdeniz', 'Anamur', 'Aydıncık', 'Bozyazı', 'Çamlıyayla', 'Erdemli',
      'Gülnar', 'Mezitli', 'Mut', 'Silifke', 'Tarsus', 'Toroslar', 'Yenişehir',
    ],
  },
  {
    name: 'İstanbul',
    slug: 'istanbul',
    districts: [
      'Adalar', 'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler',
      'Bakırköy', 'Başakşehir', 'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü',
      'Beyoğlu', 'Büyükçekmece', 'Çatalca', 'Çekmeköy', 'Esenler', 'Esenyurt',
      'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa', 'Güngören', 'Kadıköy', 'Kâğıthane',
      'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik', 'Sancaktepe', 'Sarıyer',
      'Silivri', 'Sultanbeyli', 'Sultangazi', 'Şile', 'Şişli', 'Tuzla', 'Ümraniye',
      'Üsküdar', 'Zeytinburnu',
    ],
  },
  {
    name: 'İzmir',
    slug: 'izmir',
    districts: [
      'Aliağa', 'Balçova', 'Bayındır', 'Bayraklı', 'Bergama', 'Beydağ', 'Bornova',
      'Buca', 'Çeşme', 'Çiğli', 'Dikili', 'Foça', 'Gaziemir', 'Güzelbahçe',
      'Karabağlar', 'Karaburun', 'Karşıyaka', 'Kemalpaşa', 'Kınık', 'Kiraz',
      'Konak', 'Menderes', 'Menemen', 'Narlıdere', 'Ödemiş', 'Seferihisar',
      'Selçuk', 'Tire', 'Torbalı', 'Urla',
    ],
  },
  {
    name: 'Kars',
    slug: 'kars',
    districts: [
      'Akyaka', 'Arpaçay', 'Digor', 'Kağızman', 'Merkez', 'Sarıkamış', 'Selim',
      'Susuz',
    ],
  },
  {
    name: 'Kastamonu',
    slug: 'kastamonu',
    districts: [
      'Abana', 'Ağlı', 'Araç', 'Azdavay', 'Bozkurt', 'Cide', 'Çatalzeytin',
      'Daday', 'Devrekani', 'Doğanyurt', 'Hanönü', 'İhsangazi', 'İnebolu', 'Küre',
      'Merkez', 'Pınarbaşı', 'Seydiler', 'Şenpazar', 'Taşköprü', 'Tosya',
    ],
  },
  {
    name: 'Kayseri',
    slug: 'kayseri',
    districts: [
      'Akkışla', 'Bünyan', 'Develi', 'Felahiye', 'Hacılar', 'İncesu', 'Kocasinan',
      'Melikgazi', 'Özvatan', 'Pınarbaşı', 'Sarıoğlan', 'Sarız', 'Talas',
      'Tomarza', 'Yahyalı', 'Yeşilhisar',
    ],
  },
  {
    name: 'Kırklareli',
    slug: 'kirklareli',
    districts: [
      'Babaeski', 'Demirköy', 'Kofçaz', 'Lüleburgaz', 'Merkez', 'Pehlivanköy',
      'Pınarhisar', 'Vize',
    ],
  },
  {
    name: 'Kırşehir',
    slug: 'kirsehir',
    districts: [
      'Akçakent', 'Akpınar', 'Boztepe', 'Çiçekdağı', 'Kaman', 'Merkez', 'Mucur',
    ],
  },
  {
    name: 'Kocaeli',
    slug: 'kocaeli',
    districts: [
      'Başiskele', 'Çayırova', 'Darıca', 'Derince', 'Dilovası', 'Gebze', 'Gölcük',
      'İzmit', 'Kandıra', 'Karamürsel', 'Kartepe', 'Körfez',
    ],
  },
  {
    name: 'Konya',
    slug: 'konya',
    districts: [
      'Ahırlı', 'Akören', 'Akşehir', 'Altınekin', 'Beyşehir', 'Bozkır', 'Cihanbeyli',
      'Çeltik', 'Çumra', 'Derbent', 'Derebucak', 'Doğanhisar', 'Emirgazi', 'Ereğli',
      'Güneysınır', 'Hadim', 'Halkapınar', 'Hüyük', 'Ilgın', 'Kadınhanı', 'Karapınar',
      'Karatay', 'Kulu', 'Meram', 'Sarayönü', 'Selçuklu', 'Seydişehir', 'Taşkent',
      'Tuzlukçu', 'Yalıhüyük', 'Yunak',
    ],
  },
  {
    name: 'Kütahya',
    slug: 'kutahya',
    districts: [
      'Altıntaş', 'Aslanapa', 'Çavdarhisar', 'Domaniç', 'Dumlupınar', 'Emet',
      'Gediz', 'Hisarcık', 'Merkez', 'Pazarlar', 'Simav', 'Şaphane', 'Tavşanlı',
    ],
  },
  {
    name: 'Malatya',
    slug: 'malatya',
    districts: [
      'Akçadağ', 'Arapgir', 'Arguvan', 'Battalgazi', 'Darende', 'Doğanşehir',
      'Doğanyol', 'Hekimhan', 'Kale', 'Kuluncak', 'Pütürge', 'Yazıhan', 'Yeşilyurt',
    ],
  },
  {
    name: 'Manisa',
    slug: 'manisa',
    districts: [
      'Ahmetli', 'Akhisar', 'Alaşehir', 'Demirci', 'Gölmarmara', 'Gördes',
      'Kırkağaç', 'Köprübaşı', 'Kula', 'Salihli', 'Sarıgöl', 'Saruhanlı',
      'Selendi', 'Soma', 'Şehzadeler', 'Turgutlu', 'Yunusemre',
    ],
  },
  {
    name: 'Kahramanmaraş',
    slug: 'kahramanmaras',
    districts: [
      'Afşin', 'Andırın', 'Çağlayancerit', 'Dulkadiroğlu', 'Ekinözü', 'Elbistan',
      'Göksun', 'Nurhak', 'Onikişubat', 'Pazarcık', 'Türkoğlu',
    ],
  },
  {
    name: 'Mardin',
    slug: 'mardin',
    districts: [
      'Artuklu', 'Dargeçit', 'Derik', 'Kızıltepe', 'Mazıdağı', 'Midyat', 'Nusaybin',
      'Ömerli', 'Savur', 'Yeşilli',
    ],
  },
  {
    name: 'Muğla',
    slug: 'mugla',
    districts: [
      'Bodrum', 'Dalaman', 'Datça', 'Fethiye', 'Kavaklıdere', 'Köyceğiz', 'Marmaris',
      'Menteşe', 'Milas', 'Ortaca', 'Seydikemer', 'Ula', 'Yatağan',
    ],
  },
  {
    name: 'Muş',
    slug: 'mus',
    districts: [
      'Bulanık', 'Hasköy', 'Korkut', 'Malazgirt', 'Merkez', 'Varto',
    ],
  },
  {
    name: 'Nevşehir',
    slug: 'nevsehir',
    districts: [
      'Acıgöl', 'Avanos', 'Derinkuyu', 'Gülşehir', 'Hacıbektaş', 'Kozaklı', 'Merkez',
      'Ürgüp',
    ],
  },
  {
    name: 'Niğde',
    slug: 'nigde',
    districts: [
      'Altunhisar', 'Bor', 'Çamardı', 'Çiftlik', 'Merkez', 'Ulukışla',
    ],
  },
  {
    name: 'Ordu',
    slug: 'ordu',
    districts: [
      'Akkuş', 'Altınordu', 'Aybastı', 'Çamaş', 'Çatalpınar', 'Çaybaşı', 'Fatsa',
      'Gölköy', 'Gülyalı', 'Gürgentepe', 'İkizce', 'Kabadüz', 'Kabataş', 'Korgan',
      'Kumru', 'Mesudiye', 'Perşembe', 'Ulubey', 'Ünye',
    ],
  },
  {
    name: 'Rize',
    slug: 'rize',
    districts: [
      'Ardeşen', 'Çamlıhemşin', 'Çayeli', 'Derepazarı', 'Fındıklı', 'Güneysu',
      'Hemşin', 'İkizdere', 'İyidere', 'Kalkandere', 'Merkez', 'Pazar',
    ],
  },
  {
    name: 'Sakarya',
    slug: 'sakarya',
    districts: [
      'Adapazarı', 'Akyazı', 'Arifiye', 'Erenler', 'Ferizli', 'Geyve', 'Hendek',
      'Karapürçek', 'Karasu', 'Kaynarca', 'Kocaali', 'Pamukova', 'Sapanca',
      'Serdivan', 'Söğütlü', 'Taraklı',
    ],
  },
  {
    name: 'Samsun',
    slug: 'samsun',
    districts: [
      'Alaçam', 'Asarcık', 'Atakum', 'Ayvacık', 'Bafra', 'Canik', 'Çarşamba',
      'Havza', 'İlkadım', 'Kavak', 'Ladik', 'Ondokuzmayıs', 'Salıpazarı', 'Tekkeköy',
      'Terme', 'Vezirköprü', 'Yakakent',
    ],
  },
  {
    name: 'Siirt',
    slug: 'siirt',
    districts: [
      'Baykan', 'Eruh', 'Kurtalan', 'Merkez', 'Pervari', 'Şirvan', 'Tillo',
    ],
  },
  {
    name: 'Sinop',
    slug: 'sinop',
    districts: [
      'Ayancık', 'Boyabat', 'Dikmen', 'Durağan', 'Erfelek', 'Gerze', 'Merkez',
      'Saraydüzü', 'Türkeli',
    ],
  },
  {
    name: 'Sivas',
    slug: 'sivas',
    districts: [
      'Akıncılar', 'Altınyayla', 'Divriği', 'Doğanşar', 'Gemerek', 'Gölova',
      'Gürün', 'Hafik', 'İmranlı', 'Kangal', 'Koyulhisar', 'Merkez', 'Suşehri',
      'Şarkışla', 'Ulaş', 'Yıldızeli', 'Zara',
    ],
  },
  {
    name: 'Tekirdağ',
    slug: 'tekirdag',
    districts: [
      'Çerkezköy', 'Çorlu', 'Ergene', 'Hayrabolu', 'Kapaklı', 'Malkara', 'Marmaraereğlisi',
      'Muratlı', 'Saray', 'Süleymanpaşa', 'Şarköy',
    ],
  },
  {
    name: 'Tokat',
    slug: 'tokat',
    districts: [
      'Almus', 'Artova', 'Başçiftlik', 'Erbaa', 'Merkez', 'Niksar', 'Pazar',
      'Reşadiye', 'Sulusaray', 'Turhal', 'Yeşilyurt', 'Zile',
    ],
  },
  {
    name: 'Trabzon',
    slug: 'trabzon',
    districts: [
      'Akçaabat', 'Araklı', 'Arsin', 'Beşikdüzü', 'Çarşıbaşı', 'Çaykara', 'Dernekpazarı',
      'Düzköy', 'Hayrat', 'Köprübaşı', 'Maçka', 'Of', 'Ortahisar', 'Sürmene',
      'Şalpazarı', 'Tonya', 'Vakfıkebir', 'Yomra',
    ],
  },
  {
    name: 'Tunceli',
    slug: 'tunceli',
    districts: [
      'Çemişgezek', 'Hozat', 'Mazgirt', 'Merkez', 'Nazımiye', 'Ovacık', 'Pertek',
      'Pülümür',
    ],
  },
  {
    name: 'Şanlıurfa',
    slug: 'sanliurfa',
    districts: [
      'Akçakale', 'Birecik', 'Bozova', 'Ceylanpınar', 'Eyyübiye', 'Halfeti',
      'Haliliye', 'Harran', 'Hilvan', 'Karaköprü', 'Siverek', 'Suruç', 'Viranşehir',
    ],
  },
  {
    name: 'Uşak',
    slug: 'usak',
    districts: [
      'Banaz', 'Eşme', 'Karahallı', 'Merkez', 'Sivaslı', 'Ulubey',
    ],
  },
  {
    name: 'Van',
    slug: 'van',
    districts: [
      'Bahçesaray', 'Başkale', 'Çaldıran', 'Çatak', 'Edremit', 'Erciş', 'Gevaş',
      'Gürpınar', 'İpekyolu', 'Muradiye', 'Özalp', 'Saray', 'Tuşba',
    ],
  },
  {
    name: 'Yozgat',
    slug: 'yozgat',
    districts: [
      'Akdağmadeni', 'Aydıncık', 'Boğazlıyan', 'Çandır', 'Çayıralan', 'Çekerek',
      'Kadışehri', 'Merkez', 'Saraykent', 'Sarıkaya', 'Sorgun', 'Şefaatli',
      'Yenifakılı', 'Yerköy',
    ],
  },
  {
    name: 'Zonguldak',
    slug: 'zonguldak',
    districts: [
      'Alaplı', 'Çaycuma', 'Devrek', 'Ereğli', 'Gökçebey', 'Kilimli', 'Kozlu',
      'Merkez',
    ],
  },
  {
    name: 'Aksaray',
    slug: 'aksaray',
    districts: [
      'Ağaçören', 'Eskil', 'Gülağaç', 'Güzelyurt', 'Merkez', 'Ortaköy', 'Sarıyahşi',
      'Sultanhanı',
    ],
  },
  {
    name: 'Bayburt',
    slug: 'bayburt',
    districts: [
      'Aydıntepe', 'Demirözü', 'Merkez',
    ],
  },
  {
    name: 'Karaman',
    slug: 'karaman',
    districts: [
      'Ayrancı', 'Başyayla', 'Ermenek', 'Kazımkarabekir', 'Merkez', 'Sarıveliler',
    ],
  },
  {
    name: 'Kırıkkale',
    slug: 'kirikkale',
    districts: [
      'Bahşılı', 'Balışeyh', 'Çelebi', 'Delice', 'Karakeçili', 'Keskin', 'Merkez',
      'Sulakyurt', 'Yahşihan',
    ],
  },
  {
    name: 'Batman',
    slug: 'batman',
    districts: [
      'Beşiri', 'Gercüş', 'Hasankeyf', 'Kozluk', 'Merkez', 'Sason',
    ],
  },
  {
    name: 'Şırnak',
    slug: 'sirnak',
    districts: [
      'Beytüşşebap', 'Cizre', 'Güçlükonak', 'İdil', 'Merkez', 'Silopi', 'Uludere',
    ],
  },
  {
    name: 'Bartın',
    slug: 'bartin',
    districts: [
      'Amasra', 'Kurucaşile', 'Merkez', 'Ulus',
    ],
  },
  {
    name: 'Ardahan',
    slug: 'ardahan',
    districts: [
      'Çıldır', 'Damal', 'Göle', 'Hanak', 'Merkez', 'Posof',
    ],
  },
  {
    name: 'Iğdır',
    slug: 'igdir',
    districts: [
      'Aralık', 'Karakoyunlu', 'Merkez', 'Tuzluca',
    ],
  },
  {
    name: 'Yalova',
    slug: 'yalova',
    districts: [
      'Altınova', 'Armutlu', 'Çınarcık', 'Çiftlikköy', 'Merkez', 'Termal',
    ],
  },
  {
    name: 'Karabük',
    slug: 'karabuk',
    districts: [
      'Eflani', 'Eskipazar', 'Merkez', 'Ovacık', 'Safranbolu', 'Yenice',
    ],
  },
  {
    name: 'Kilis',
    slug: 'kilis',
    districts: [
      'Elbeyli', 'Merkez', 'Musabeyli', 'Polateli',
    ],
  },
  {
    name: 'Osmaniye',
    slug: 'osmaniye',
    districts: [
      'Bahçe', 'Düziçi', 'Hasanbeyli', 'Kadirli', 'Merkez', 'Sumbas', 'Toprakkale',
    ],
  },
  {
    name: 'Düzce',
    slug: 'duzce',
    districts: [
      'Akçakoca', 'Cumayeri', 'Çilimli', 'Gölyaka', 'Gümüşova', 'Kaynaşlı', 'Merkez',
      'Yığılca',
    ],
  },
]

// TR→ASCII fold + lowercase, matching src/lib/geo.ts slugify character rules.
const TR_FOLD: Record<string, string> = {
  'İ': 'i', 'I': 'i', 'ı': 'i',
  'Ş': 's', 'ş': 's',
  'Ğ': 'g', 'ğ': 'g',
  'Ü': 'u', 'ü': 'u',
  'Ö': 'o', 'ö': 'o',
  'Ç': 'c', 'ç': 'c',
}

function foldSlug(s: string): string {
  return s
    .split('')
    .map((c) => TR_FOLD[c] ?? c.toLowerCase())
    .join('')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Returns the districts array for the province matching by name OR slug
 * (case-insensitive, spelling-tolerant). Returns [] if not found.
 */
export function districtsOf(province: string): string[] {
  const target = foldSlug(province ?? '')
  if (!target) return []
  const match = TR_PROVINCES.find((p) => p.slug === target || foldSlug(p.name) === target)
  return match ? match.districts : []
}
