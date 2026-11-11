# Ürün Gereksinimleri — Çevrimiçi Alışveriş Sitesi

Bu belge, ürün gereksinimlerinin kapsamını ve kabul kriterlerini tutar. Gereksinimler Agile dilimler halinde geliştirilir; her gereksinim API/UI uygulamasına, testlere ve tamamlanma kararına izlenebilir olmalıdır.

## Ürün özeti

Müşterilerin ürünleri bulup satın alabildiği bir çevrimiçi mağaza geliştirilecektir. Ürün kataloğu, arama, sepet, sipariş ve kullanıcı hesapları ayrı dilimlerle eklenecektir. Kimlik sağlayıcı olarak Keycloak kullanılacak; uygulama kimlik doğrulamayı OIDC üzerinden yapacak, mağazaya özgü profil ve yetkilendirme kararlarını backend'de sürdürecektir.

## Kapsam ve varsayımlar

- İlk istemci uygulaması tarayıcı üzerinden kullanılacaktır; bu gereksinim backend API ve login arayüzünü kapsar.
- REQ-001'in yerel parola tabanlı ilk prototipi Keycloak/OIDC entegrasyonuyla değiştirilmektedir; alıcı self-registration REQ-006 kapsamındadır.
- Alıcı, satıcı ve platform yöneticisi farklı iş profilleridir. Herkese açık kayıt yalnızca alıcı hesabı oluşturur; satıcı/yönetici rolü kullanıcı tarafından seçilemez veya yükseltilemez.
- Ürün öğrenme kapsamı çok satıcılı marketplace akışlarını ve yerel/mock ödeme, sipariş operasyonu ve iptal davranışlarını kapsar. Gerçek ödeme/PSP, kargo/taşıyıcı ve KYC/KYB entegrasyonları ile canlıya çıkış kapsam dışıdır.
- E-posta doğrulama ve parola sıfırlama daha sonraki dilimlere bırakılmıştır; ilk kayıt akışında e-posta doğrulaması zorunlu değildir.
- Yerel geliştirme ve Alembic migration hedefi Docker Compose PostgreSQL'dir. Hızlı unit/API testleri ve izole Playwright E2E veritabanı olarak SQLite kullanılır. PostgreSQL bağlantı/migration temeli REQ-009 QA adımında kuruldu; PostgreSQL eşzamanlılık testleri kapanış koşulu olarak ayrıca çalıştırılacaktır.
- Ana sayfa ve ürün kataloğu yalnızca doğrulanmış kullanıcılara sunulur. Ürün CRUD'u admin için mağaza genelinde, onaylı seller için yalnızca kendisine ait ürünlerde kullanılabilir.

## Gereksinim öncelikleri

- **P0:** İlk çalışan müşteri dilimi için zorunlu.
- **P1:** İlk ürün sürümünde gerekli, ancak sonraki dilimde tamamlanabilir.
- **P2:** İleri sürüm/iyileştirme.

## Kullanıcı profili araştırması ve ürün kararları

Bu araştırma, sağlayıcıların kamuya açık müşteri/satıcı akışları ile mağaza için aldığımız ürün kararlarını birbirinden ayırır. Büyük pazar yerlerinin iç rol/izin matrisleri kamuya açık olmadığı için aşağıdaki profiller birebir Amazon veya Trendyol iç sistemlerinin rol dökümü değildir.

| Profil | Pazar yeri örüntüsü ve proje kararı |
|---|---|
| Alıcı | Trendyol'un herkese açık giriş/kayıt ekranı e-posta ile devam etme ve Google/Facebook ile devam etme seçeneklerini gösteriyor. Amazon'un tüketici hesapları da ayrı bir alışveriş hesabı deneyimi sunuyor. İlk dilimde kullanıcı e-posta ve parola ile kendi alıcı hesabını oluşturur; adres/ödeme bilgisi kayıt sırasında istenmez. |
| Satıcı | Amazon'ın resmi satıcı kayıt rehberi, satıcı kaydını alıcı hesabından ayrı bir iş akışı olarak tanımlıyor; işletme, birincil irtibat, banka/ödeme bilgileri ve kimlik doğrulaması istiyor. Trendyol Partner/Satıcı portalı ayrı bir iş yüzeyi; erişilebilen herkese açık sayfalar iç rol ve doğrulama ayrıntılarını göstermiyor. Projede alıcı hesabı satıcı başvurusu yapabilir; admin beyanları manuel inceler. Onay, öğrenme uygulamasında satıcı yetkisini açar; marketplace sipariş erişimi REQ-017'de tanımlanır. Gerçek KYC/KYB, ödeme ve kargo entegrasyonları kapsam dışıdır. |
| Platform yöneticisi | Pazar yerlerinde platform operasyonu ve moderasyonu alıcı/satıcı deneyimlerinden ayrıdır. Bu projede admin rolü yalnızca güvenilir yönetim kanalından atanır; herkese açık kayıtla admin olunamaz. Admin, mağaza geneli yönetim ve satıcı başvurusu incelemesini yapar; marketplace gözetim kuralları ilgili gereksinimlerde tanımlanır. |

**Kaynaklar (30 Ekim 2026'da erişilen kamuya açık sayfalar):**

- [Trendyol — Giriş Yap veya Üye Ol](https://www.trendyol.com/uyelik): e-posta ile devam ve Google/Facebook seçenekleri.
- [Trendyol Partner Portalı](https://partner.trendyol.com/): satıcı iş yüzeyi; sayfa JavaScript ve oturum gerektirdiği için dahili kayıt/rol kuralları doğrulanamadı.
- [Amazon — How to sell on Amazon](https://sell.amazon.com/sell): satıcı kayıt planı, işletme/irtibat bilgileri, banka ve kimlik doğrulaması adımları.
- [Keycloak Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/): Keycloak kullanıcı, rol, self-registration ve hesap yönetimi kabiliyetleri.

**Karar:** İlk kullanıcı yönetimi dilimi Keycloak ile OIDC tabanlı olacak. Alıcı kendi kendine kayıt olabilir; satıcı ve admin erişimleri güvenilir yönetim süreciyle verilir. E-posta doğrulama ve parola sıfırlama sonraki roadmap maddeleridir.

## REQ-001 — Kayıtlı müşteri girişi ve ana sayfaya erişim

**Öncelik:** P0  
**Durum:** Yerel parola tabanlı prototip superseded; Keycloak/OIDC entegrasyonu ve doğrulaması REQ-006 kapsamında devam ediyor.
**Kullanıcı hikâyesi:** Bir alıcı olarak hesabıma güvenli biçimde giriş yapıp mağaza ana sayfasını görmek istiyorum; böylece alışverişe başlayabilirim.

**Ön koşul:** Alıcı hesabı Keycloak `shop` realm'inde etkindir ve `buyer` rolüne sahiptir.

### Kabul kriterleri

1. Web istemcisi kullanıcıyı Keycloak'a yönlendirir; OIDC Authorization Code + PKCE kullanılır ve uygulama parolayı almaz.
2. Keycloak'tan dönen access token yalnızca yapılandırılmış issuer, audience ve imzaya göre doğrulanır; API, geçerli ve aktif access token ile çalışır.
3. Token yok/bozuk/süresi dolmuş, yanlış issuer/audience veya bilinmeyen imzaya sahipse korumalı API `401 Unauthorized` döndürür.
4. JWKS anahtarları alınamıyorsa API token'ı kabul etmez ve `503 Service Unavailable` döndürür.
5. Geçerli access token ile `/api/v1/auth/me` kullanıcı subject, e-posta ve uygulama rollerini döndürür; parola ve token yanıtta yer almaz.
6. Geçerli `buyer` token'ı ile ana sayfa isteği başarıyla karşılanır; ürün kataloğu REQ-002'ye göre listelenir.
7. Başarılı oturumda token tarayıcı oturum saklamasında tutulur; çıkış Keycloak oturumunu sonlandırır.

### Dışarıda bırakılanlar

- Müşteri kayıt, parola sıfırlama, çok faktörlü kimlik doğrulama ve sosyal giriş.
- Refresh token yenileme, cihaz/oturum yönetimi ve gelişmiş oturum denetimi.
- Ürün arama, filtreleme, kampanya ve kişiye özel ana sayfa içeriği.
- Kayıt, ürün listesi ve müşteri hesabı ekranları.

### API sözleşmesi (Keycloak entegrasyonu)

Giriş ve kayıt Keycloak hosted OIDC akışında yapılır; mağaza API'sinde parola alan endpoint bulunmaz. Eski `POST /api/v1/auth/login` endpoint'i kaldırılmıştır.

#### `GET /api/v1/auth/me`

İstek başlığı: `Authorization: Bearer <keycloak-access-token>`

Başarılı yanıt `200 OK`:

```json
{
  "subject": "<keycloak-user-subject>",
  "email": "buyer@example.com",
  "roles": ["buyer"],
  "is_admin": false
}
```

Geçersiz token `401 Unauthorized`; JWKS erişim hatası `503 Service Unavailable` döndürür.

#### `GET /api/v1/home`

İstek başlığı: `Authorization: Bearer <access_token>`

Başarılı yanıt `200 OK`:

```json
{
  "message": "Alışverişe hoş geldiniz",
  "featured_categories": []
}
```

Erişim belirteci yoksa veya geçersizse `401 Unauthorized` döndürülür.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-001-T1 | Unit/API | OIDC token doğru imza, issuer, audience ve claim'lerle | `/auth/me` ve korumalı mağaza API'leri `200` |
| REQ-001-T2 | API negatif | Token yok, bozuk, expired, imza/issuer/audience hatalı | `401`; korumalı veri açığa çıkmaz |
| REQ-001-T3 | API/operasyon | JWKS endpoint erişilemez | `503`; token kabul edilmez ve hata kaydedilir |
| REQ-001-T4 | API | Geçerli alıcı token'ı ile `/auth/me` ve ana sayfa | Doğrulanmış subject/rol ve beklenen içerik döner |
| REQ-001-T5 | Güvenlik | Login isteği ve frontend formu | API'ye parola gönderilmez; kullanıcı parolası uygulama loglarına girmez |
| REQ-001-T6 | Component | Keycloak login/kayıt yönlendirmeleri | Tarayıcı OIDC provider'a yönlenir; uygulamada credential alanı bulunmaz |
| REQ-001-T7 | Component | OIDC callback ve session restore | Geçerli session ile korumalı API çağrıları yapılır; expired session restore edilmez |
| REQ-001-T8 | E2E | Keycloak hosted login ve ana sayfa | Giriş sonrası katalog görünür; çıkış Keycloak session'ını sonlandırır |

## REQ-002 — Giriş sonrası ana sayfada ürünleri listeleme

**Öncelik:** P0
**Durum:** Tamamlandı; backend, frontend ve E2E testleriyle doğrulandı.
**Kullanıcı hikâyesi:** Giriş yapmış bir müşteri olarak mağaza ana sayfasında ürünleri tablo halinde görmek istiyorum; böylece ürünleri ve temel bilgilerini karşılaştırmaya başlayabilirim.
**Ön koşul:** Kullanıcı hesabı etkin durumdadır ve geçerli bir erişim belirteci vardır. Örnek ürün oluşturma için yönetici hesabı gerekir.

### Kabul kriterleri

1. Başarılı girişten sonra frontend `/api/v1/home` ve korumalı `/api/v1/products` endpoint'lerini çağırır; ürünler ana sayfada listelenir.
2. Ürün listesi ürün adı, kategori, açıklama, TRY fiyatı ve stok miktarını tablo halinde gösterir.
3. Boş katalog, yükleniyor ve ürünleri yükleyememe durumları kullanıcıya anlaşılır biçimde gösterilir; yükleme hatası tekrar denenebilir.
4. Ürün listesi varsayılan olarak ilk 20 kaydı döndürür; `limit` 1–100, `offset` sıfır veya daha büyük olabilir. Sonuçlar ürün kimliğine göre kararlı sıradadır.
5. Ürün listesi isteğinde geçerli müşteri belirteci zorunludur; yetkisiz veya geçersiz istek `401 Unauthorized` döndürür.
6. Buyer ürün oluşturamaz; `POST /api/v1/products` isteği `403 Forbidden` döndürür. Admin tüm ürünleri, onaylı seller ise yalnızca kendisine ait ürünleri oluşturabilir/düzenleyebilir/silebilir.
7. Ürün oluşturma alanları REQ-003'teki tür, uzunluk, biçim ve aralık kısıtlarına göre doğrulanır. Geçersiz veri `422` döndürür ve kaydedilmez.
8. Örnek ürünler, aynı yöneticiye açık `POST /api/v1/products` endpoint'i kullanılarak eklenir ve listeleme endpoint'i ile doğrulanır.

### API sözleşmesi

#### `GET /api/v1/products?limit=20&offset=0`

İstek başlığı: `Authorization: Bearer <access-token>`

Başarılı yanıt `200 OK`:

```json
{
  "products": [
    {
      "id": 1,
      "name": "Lavanta El Kremi",
      "category": "Kişisel Bakım",
      "description": "Günlük kullanım için nemlendirici el kremi.",
      "price": "129.90",
      "stock": 24
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

#### `POST /api/v1/products`

Admin ve onaylı seller rolüne açık. Seller ürününün sahibi doğrulanmış token `sub` değeridir; istemci owner belirleyemez. Yeni seller ürünü ortak katalogda hemen görünür. İstek gövdesi `name`, `category`, `description`, `price` ve `stock` alanlarından oluşur; başarılı yanıt `201 Created` döndürür. Geçersiz veri `422`, buyer `403`, token yok/geçersiz ise `401` alır.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-002-T1 | API | Boş ürün kataloğu, geçerli müşteri belirteci | `200`, boş liste ve toplam 0 |
| REQ-002-T2 | API | Geçerli admin gövdesiyle ürün oluşturma | `201`, saklanan ürün alanları döner |
| REQ-002-T3 | API | Buyer ürün oluşturmaya çalışır | `403`, ürün oluşturulmaz |
| REQ-002-T4 | API | Ürün adı/kategori/açıklama/fiyat/stok sınırları geçersiz | `422`, ürün oluşturulmaz |
| REQ-002-T5 | API | Ürünleri limit ve offset ile listeleme | Toplam sayısı ve kimliğe göre kararlı sayfa döner |
| REQ-002-T6 | API | Token yok veya pagination parametresi geçersiz | Sırasıyla `401` veya `422` |
| REQ-002-T7 | Component/integration | Ürün listesi yüklendi | Ad, kategori, açıklama, TRY fiyatı ve stok erişilebilir tabloda görünür |
| REQ-002-T8 | Component | Boş katalog veya ürün API hatası | Boş durum veya yeniden denenebilir hata gösterilir |
| REQ-002-T9 | E2E | Admin veya onaylı seller ürün ekler, buyer kataloğu görüntüler | Ürün ortak katalogda görünür; yönetim eylemleri yalnızca ilgili ürünün admin'i veya sahibi seller'ına görünür |
| REQ-002-T10 | E2E | Hatalı giriş | Ana sayfa ve ürün endpoint'lerine istek gönderilmez |
| REQ-002-T11 | Unit | `ProductCreateRequest` şema sınırları | Geçerli üst sınırlar kabul; uzunluk/fiyat/stok dışı değerler reddedilir |
| REQ-002-T12 | Frontend unit | Ürün istemcisi API hatası | HTTP hata durumu ve mesajı çağırana aktarılır |
| REQ-002-T13 | Component | Ürün listesi beklemede | Erişilebilir yükleniyor durumu tablo gelene kadar görünür |
| REQ-002-T14 | API/E2E | Onaylı seller ürün oluşturur | Ürün owner token `sub` ile kaydedilir ve ortak katalogda hemen görünür |
| REQ-002-T15 | API negatif | Onaysız veya seller rolü olmayan kullanıcı ürün oluşturur | `403`; ürün kalıcılaşmaz |

**Test katmanı izlenebilirliği:** Şema alanlarının sınır/birim doğrulaması `apps/api/tests/test_product_schemas.py` (unit); kimlik doğrulama, admin/seller sahiplik yetkisi, SQLite kalıcılığı, API yanıtları ve sayfalama `apps/api/tests/test_products.py` (API/entegrasyon); başvuru ve Keycloak rol provisioning testleri REQ-007 kapsamında eklenir. Gerçek Keycloak E2E'de seller'ın yalnızca kendi ürün CRUD'u, buyer'ın salt-okunur katalog erişimi ve ortak katalogda anında yayın doğrulanır; admin CRUD regresyonu korunur.

## REQ-003 — Admin girişi ve ürün ekleme

**Öncelik:** P0
**Durum:** Tamamlandı; rol bazlı admin girişi, ürün ekleme arayüzü ve testleri doğrulandı.
**Kullanıcı hikâyesi:** Mağaza yöneticisi olarak yönetici hesabımla giriş yapıp ürün ekleme ekranını kullanmak istiyorum; böylece kataloğu uygulama üzerinden güncel tutabilirim.
**Ön koşul:** Yönetici hesabı etkin durumdadır ve admin rolüne sahiptir.

### Ürün alanı format kuralları

| Alan | Tür / biçim | Sınırlar | Geçersiz değer davranışı |
|---|---|---|---|
| `name` | String; Unicode harf/rakam, `_`, boşluk, tire ve kesme işareti | Zorunlu, 2–32 karakter; boşluklar normalize edilir; normalize edilmiş ad Unicode NFC ve harf duyarsız benzersizdir | Biçim/uzunluk hatası `422`; ad çakışması `409` |
| `category` | String; Unicode harf/rakam, `_`, boşluk, `&`, `/`, kesme işaretleri ve tire | Zorunlu, 2–40 karakter; boşluklar normalize edilir | `422`, kayıt oluşturulmaz |
| `description` | String; yazdırılabilir Unicode; satır sonu/tab serbest | Zorunlu, 10–500 karakter; baş/son boşluklar kırpılır | `422`, kayıt oluşturulmaz |
| `price` | Ondalık sayı, en fazla iki kesir basamağı | `0.01`–`999999.99` TL | Sayı/precision/aralık hatası `422`, kayıt oluşturulmaz |
| `stock` | Strict tam sayı | `0`–`999999` adet | Kesirli/metin/negatif/aralık dışı değer `422`, kayıt oluşturulmaz |

### Kabul kriterleri

1. Admin, mevcut giriş endpoint'ine geçerli kimlik bilgileriyle giriş yapar; yanıt kendi rolünü `is_admin: true` olarak bildirir.
2. Normal müşteri girişi `is_admin: false` döndürür; kullanıcı/rol bilgisi yalnızca giriş yapan hesaba aittir.
3. Admin girişinde ürün listesi sayfasında **Ürün ekle** butonu görünür; müşteri girişinde bu buton ve ürün ekleme ekranına erişim görünmez.
4. Admin butona bastığında ürün adı, kategori, açıklama, TL fiyatı ve stok alanlarını içeren ayrı ürün ekleme sayfası açılır.
5. Form her alan için yukarıdaki uzunluk, biçim ve aralıkları tarayıcıda doğrular; kısıt ihlalinde API isteği göndermez.
6. Geçerli form admin veya onaylı seller erişim belirteciyle `POST /api/v1/products` endpoint'ini çağırır. Backend rolü ve seller başvuru onayını doğrular; seller ürününü token `sub` sahibine bağlar.
7. `201 Created` yanıtında eklenen ürün katalog tablosuna eklenir ve admin ürün listesi ekranına döner.
8. Form iptal edilirse kayıt isteği gönderilmez ve mevcut katalog ekranına dönülür.
9. Yinelenen normalleştirilmiş ad `409 Conflict` ve kullanıcı dostu bir mesaj alır; diğer yetki, oturum, doğrulama, sunucu veya ağ hataları sunucu iç detaylarını açığa çıkarmayan mesajlarla gösterilir. İstek sürerken yinelenen gönderim engellenir.
10. İstemci doğrulamasını atlayan doğrudan API isteklerinde backend aynı alan kısıtlarını uygular; veritabanı uzunluk, sayısal aralık ve normalize edilmiş ad benzersizliğini ayrıca korur.

### API sözleşmesi

#### `POST /api/v1/auth/login`

Başarılı yanıt, erişim belirteci ve oturum bilgilerine ek olarak giriş yapan kullanıcının rolünü bildirir:

```json
{
  "access_token": "<signed-access-token>",
  "token_type": "bearer",
  "expires_in": 1800,
  "is_admin": true
}
```

#### `POST /api/v1/products`

REQ-002'de tanımlanan endpoint kullanılır. İstek `Authorization: Bearer <admin-access-token>` başlığı gerektirir; müşteri için `403`, belirteç yok/geçersiz ise `401`, geçersiz alanlarda `422`, yinelenen ad için `409`, başarılı kayıtta `201 Created` döner.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-003-T1 | API | Admin ile giriş | `200`, `is_admin: true` |
| REQ-003-T2 | API | Müşteri ile giriş | `200`, `is_admin: false` |
| REQ-003-T3 | Unit | `createProduct` istemci çağrısı | JSON gövde ve admin Bearer başlığı doğru gönderilir |
| REQ-003-T4 | Component | Admin girişi | Ürün ekle butonu görünür; form sayfası açılır |
| REQ-003-T5 | Component | Müşteri girişi | Ürün ekle butonu görünmez |
| REQ-003-T6 | Component | Boş/biçimi geçersiz ürün formu | Tarayıcı doğrulaması; POST isteği gönderilmez |
| REQ-003-T7 | Component/integration | Geçerli ürün oluşturma | Form POST atar; dönen kayıt katalog tablosunda görünür |
| REQ-003-T8 | Component | İptal ve bekleyen kayıt | İptal POST atmaz; gönderim sırasında buton yinelenen kaydı engeller |
| REQ-003-T9 | Component | `401`, `403`, `422`, `5xx` ve bağlantı hataları | Güvenli ve duruma uygun hata mesajı görünür |
| REQ-003-T10 | E2E | Admin ile tarayıcıdan giriş ve ürün ekleme | Admin sayfasından kayıt yapılır, `201` ve güncellenen ürün tablosu doğrulanır |
| REQ-003-T11 | Unit | `ProductCreateRequest` geçerli üst sınırları ve metin normalizasyonu | 32/40/500 karakter ve sayısal üst sınırlar kabul edilir |
| REQ-003-T12 | Unit/API negatif | Ad/kategori biçimi veya uzunluğu, açıklama uzunluğu, fiyat precision/aralığı, stok tür/aralığı geçersiz | Unit doğrulaması hata verir; API `422` döndürür ve katalog değişmez |
| REQ-003-T13 | API/DB | Adın büyük-küçük harf/boşluk/NFC normalizasyonundan sonra yinelenmesi | `409`; DB unique constraint ile ikinci kayıt da engellenir |
| REQ-003-T14 | DB | API katmanı atlanarak check constraint sınırlarının ihlali | Veritabanı `IntegrityError` üretir; geçersiz ürün kalıcılaşmaz |
| REQ-003-T15 | Component | Her alanda uzunluk/biçim/sayısal sınır ihlali | Alan tarayıcı tarafından geçersiz işaretlenir, POST gönderilmez |
| REQ-003-T16 | Component | Aynı ad için API `409` yanıtı | Formda yinelenen ürün adı mesajı görünür |
| REQ-003-T17 | E2E | Biçim dışı ürün adı | Form reddeder, ürün API'sine POST gönderilmez |
| REQ-003-T18 | E2E | Var olan adın farklı harf kullanımıyla tekrar eklenmesi | API `409`, admin sayfasında anlaşılır hata mesajı |
| REQ-003-T19 | Migration | Eski ürün kayıtlarında alan genişliği ve normalize edilmiş ad anahtarı | Upgrade sırasında anahtar doldurulur; downgrade ürün alanlarını korur |
| REQ-003-T20 | E2E regresyon | Admin ürünü ekler, yinelenen/geçersiz girdiyi reddeder, düzenler ve siler | Gerçek Keycloak rolü, tüm alanların güncellenmesi, güncelleme rozeti ve silme sonrası katalog kontrol edilir |

**Test katmanı izlenebilirliği:** Alan şema/normalizasyon sınırları `apps/api/tests/test_product_schemas.py` (unit); migration backfill ve rollback `apps/api/tests/test_product_migration.py`; API `422`/`409` ve DB kalıcılığı `apps/api/tests/test_products.py` (API/entegrasyon); gövde/başlık/hata aktarımı `apps/web/src/api.test.ts` (istemci unit); form sınırları, olumsuz girdiler, başarı, iptal ve API hata mesajları `apps/web/src/ProductCreatePage.test.tsx`; rol bazlı görünürlük ve başarılı kayıt `apps/web/src/App.test.tsx`; gerçek Keycloak admin CRUD, geçersiz/yinelenen ürün adı, düzenleme, güncel buyer kataloğu, buyer CRUD `403` ve silme `apps/web/e2e/admin-crud.spec.ts`; buyer kayıt ve giriş negatifleri `apps/web/e2e/login.spec.ts`. Lint, TypeScript ve coverage eşikleri CI kalite kapılarıdır.

## REQ-004 — Admin ürün güncelleme

**Öncelik:** P0
**Durum:** Tamamlandı; admin düzenleme akışı, ürün güncelleme API'si ve iki katalog görünümü doğrulandı.
**Kullanıcı hikâyesi:** Mağaza yöneticisi olarak mevcut bir ürünün tüm bilgilerini düzenleyip kaydetmek istiyorum; böylece katalogdaki ürün bilgileri güncel kalır. Müşteri olarak da güncel ürünü ve güncellendiği bilgisini görmek istiyorum.
**Ön koşul:** Admin oturumu açık olmalı ve güncellenecek ürün katalogda bulunmalıdır.

### Ürün güncellemesini ayırt etme

Ürün kaydındaki `updated_at` alanı, ürün ilk oluşturulurken `null` kalır ve başarılı her güncellemede sunucu UTC zamanı ile doldurulur. Admin ve müşteri ürün listelerinde dolu değerli ürünün yanında **Güncellendi** rozeti görünür; üzerine gelindiğinde yerel biçimli son güncelleme zamanı sunulur. Böylece güncellenen ürün, yeni eklenen üründen iki listede de ayrılır.

### Kabul kriterleri

1. Admin ürün listesindeki **Düzenle** eylemi seçilen ürünün tüm mevcut değerleriyle düzenleme formunu açar.
2. Ürün adı, kategori, açıklama, fiyat ve stok alanlarının tamamı güncellenebilir; REQ-003 doğrulama ve benzersizlik kuralları güncellemede de uygulanır.
3. Admin, `PUT /api/v1/products/{id}` ile tam ürün temsilini kaydeder. Başarı `200 OK`, bulunamayan ürün `404`, geçersiz alan `422`, başka ürünün adıyla çakışma `409` döndürür; yetki kontrolleri `401`/`403` olarak korunur.
4. Ürünün `updated_at` alanı başarılı güncellemede doldurulur; ürün adı değişmese bile her başarılı güncelleme bu zamanı yeniler.
5. Başarılı kayıt admin listesindeki mevcut ürünü yerinde günceller ve **Güncellendi** rozetini gösterir; yeni ürün gibi ikinci satır eklemez.
6. Standart kullanıcı kataloğu da tüm güncellenmiş alanları ve **Güncellendi** rozetini API'den gösterir. Yeni ürünlerde rozet görünmez.
7. Geçersiz veya çakışan bir güncelleme ürünün mevcut değerlerini ve `updated_at` bilgisini değiştirmez; form kullanıcıya güvenli ve anlaşılır hata gösterir.

### API sözleşmesi

#### `PUT /api/v1/products/{id}`

Admin tüm ürünleri, seller yalnızca kendi ürününü güncelleyebilir. Tüm ürün alanlarını bekler; REQ-003 validasyonları uygulanır. Yanıt `ProductResponse` içerir ve `updated_at` ISO-8601 zamanı döndürür.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-004-T1 | API | Admin tüm alanları günceller | `200`, tüm değerler ve `updated_at` döner |
| REQ-004-T2 | API/entegrasyon | Müşteri güncellenmiş ürünü listeler | Ürün alanları ve `updated_at` güncel yanıtlanır |
| REQ-004-T3 | API | Token yok, buyer, başka seller'a ait veya bulunmayan ürün | Sırasıyla `401`, `403`, `404`; veri değişmez |
| REQ-004-T4 | API negatif | Geçersiz alan veya başka ürünle çakışan ad | `422`/`409`; mevcut ürün ve update zamanı korunur |
| REQ-004-T5 | Unit | `updateProduct` istemci çağrısı | `PUT`, ürün ID'si, admin bearer token ve tüm gövde doğru gönderilir |
| REQ-004-T6 | Component | Admin düzenleme akışı | Mevcut alanlar önceden doldurulur, başarı sonrası satır güncellenir |
| REQ-004-T7 | Component | Yeni ve düzenlenmiş ürün rozeti | `updated_at=null` için rozet yok; zamanı olan ürün için **Güncellendi** görünür |
| REQ-004-T8 | E2E | Admin ürünü düzenler | `PUT` başarılı olur, aynı satır alanları değişir ve rozet görünür |
| REQ-004-T9 | E2E | Müşteri güncellenmiş kataloğu açar | Güncellenmiş alanlar ve rozet görünür |
| REQ-004-T10 | Migration | Güncelleme zamanı kolonunun eklenip geri alınması | Mevcut ürünler `null` kalır; downgrade ürün kayıtlarını korur |
| REQ-004-T11 | API negatif | Her alan için şema geçersizliğiyle ürün güncelleme | 26 geçersiz değer sınıfı `422` alır; tüm eski alanlar ve `updated_at` değişmez |
| REQ-004-T12 | Component negatif | Düzenleme formunda her alan için geçersiz değer | 24 girdinin her biri istek göndermez ve kayıt callback'ini çağırmaz |
| REQ-004-T13 | E2E negatif | Tarayıcıda geçersiz ürün adıyla güncelleme | Doğrulama mesajı görünür; `PUT` isteği gönderilmez |
| REQ-004-T14 | API/E2E negatif | Seller başka seller'ın ürününü günceller | `404` ile sahiplik sızıntısı önlenir; kayıt değişmez |

**Test katmanı izlenebilirliği:** Güncelleme, rol, 26 sınıflı geçersiz alan matrisi, unique çakışma ve katalog okuma `apps/api/tests/test_products.py`; migration `apps/api/tests/test_product_migration.py`; `PUT` istemcisi `apps/web/src/api.test.ts`; düzenleme formunun 24 sınıflı geçersiz alan matrisi ve ürün satırı değişimi `apps/web/src/App.test.tsx` ile `apps/web/src/ProductCreatePage.test.tsx`; tüm alanların güncellenmesi, update rozeti, buyer kataloğu ve geçersiz düzenlemenin `PUT` göndermemesi `apps/web/e2e/admin-crud.spec.ts` ile doğrulanır.

## REQ-005 — Admin ürün silme

**Öncelik:** P0
**Durum:** Tamamlandı; admin silme akışı, müşteri yetki kısıtlaması ve silme sonrası katalog doğrulaması test edildi.
**Kullanıcı hikâyesi:** Mağaza yöneticisi olarak artık satışta olmayan bir ürünü katalogdan kaldırmak istiyorum; müşteri olarak silinen ürünleri katalogda görmemeliyim.
**Ön koşul:** Admin oturumu açık olmalı ve silinecek ürün katalogda bulunmalıdır.

### Silme davranışı

Bu sürümde ürünler kalıcı olarak silinir; onay penceresi geri alınamayacağı konusunda admini uyarır. Mevcut veri modelinde ürüne bağlı sipariş veya başka geçmiş kayıt bulunmadığından silme işlemi güvenlidir. Sipariş geçmişi eklendiğinde, siparişte kullanılan ürünleri silmeyi engelleme veya ürün bilgisinin sipariş anındaki kopyasını koruma kuralı ayrıca tanımlanmalıdır.

### Kabul kriterleri

1. Admin, katalogdaki her ürün için erişilebilir **Sil** eylemini görür; standart kullanıcıya silme eylemi veya işlem sütunu gösterilmez.
2. Admin silme eylemini seçtiğinde ürün adı ve işlemin geri alınamayacağı belirtilen onay istenir. İptal API isteği göndermez ve ürünü listede tutar.
3. Onaydan sonra frontend `DELETE /api/v1/products/{id}` çağrısını admin belirteciyle yapar. Başarı `204 No Content` döndürür; gövde içermez.
4. Ürün sadece silme isteği başarılı olduğunda admin listesinden hemen kaldırılır ve ürün sayısı güncellenir. Silinen ürün sayfa yenilendiğinde müşteri kataloğunda da bulunmaz.
5. Token yok/geçersiz ise `401`, standart kullanıcı silmeye çalışırsa `403`, ürün bulunamazsa `404` döner. Başarısız silme mevcut listeyi değiştirmez ve arayüz güvenli hata mesajı gösterir.
6. Başarılı silme kaydı veritabanından kaldırır; aynı normalize edilmiş adla yeni ürün daha sonra oluşturulabilir.

### API sözleşmesi

#### `DELETE /api/v1/products/{id}`

Admin tüm ürünleri, seller yalnızca kendisine ait ürünü silebilir. Başarıda boş gövdeli `204 No Content`; bulunmayan veya başka seller'a ait ürün için `404`, buyer/onaysız seller için `403`, eksik/geçersiz kimlik doğrulama için `401` döndürülür.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-005-T1 | API/entegrasyon | Admin var olan ürünü siler | `204`, boş yanıt; ürün admin ve müşteri listelerinden kalkar, toplam azalır |
| REQ-005-T2 | API negatif | Token yok, buyer, başka seller'ın ürünü veya ürün ID'si yok | Sırasıyla `401`, `403`, `404`, `404`; ürün kaydı korunur |
| REQ-005-T3 | API/DB | Ürün silindikten sonra aynı adı yeniden oluşturma | Yeni oluşturma `201` olur; silinen kaydın benzersizlik anahtarı kalmaz |
| REQ-005-T4 | Unit | `deleteProduct` istemci çağrısı | `DELETE`, ürün ID'si ve bearer token doğru gönderilir; boş `204` yanıtı başarı sayılır |
| REQ-005-T5 | Component | Admin silmeyi iptal eder | Onay reddedilir; API çağrılmaz ve ürün listede kalır |
| REQ-005-T6 | Component | Admin silmeyi onaylar | Başarılı yanıtla yalnızca hedef satır kaldırılır ve ürün sayısı güncellenir |
| REQ-005-T7 | Component | Silme isteği başarısız olur | Güvenli hata mesajı gösterilir; hedef ürün listede kalır |
| REQ-005-T8 | Component | Standart kullanıcı kataloğu | Silme düğmesi ve işlem sütunu görünmez |
| REQ-005-T9 | E2E | Admin gerçek API üzerinden siler | Onay diyaloğu görünür; `204` sonrası hedef satır kaybolur |
| REQ-005-T10 | E2E | Müşteri silme endpoint'ini çağırır | `403`; katalog ürünü korur ve arayüzde silme eylemi yoktur |
| REQ-005-T11 | API negatif | DELETE isteğinde geçersiz bearer token | `401`; kayıt silinmez |
| REQ-005-T12 | Component negatif | DELETE yanıtı `401` veya `404` | Güvenli hata görünür; ürün katalogda kalır |
| REQ-005-T13 | Component | DELETE isteği beklemede | Eylem devre dışı; aynı kayıt için yinelenen istek gönderilmez |

**Test katmanı izlenebilirliği:** Silme endpoint'i, rol/404/geçersiz belirteç kontrolleri ve silme sonrası katalog/benzersizlik doğrulamaları `apps/api/tests/test_products.py`; boş yanıt ve hata aktarımı `apps/web/src/api.test.ts`; onay/iptal, hedef satırın kaldırılması, `401`/`404` ve ağ hatasında korunması, bekleyen istekte tekrarın engellenmesi `apps/web/src/App.test.tsx`; gerçek admin silme ve buyer'ın silme dahil tüm CRUD işlemlerinde `403` alması `apps/web/e2e/admin-crud.spec.ts` ile doğrulanır.

## REQ-006 — Keycloak ile alıcı kaydı ve rol tabanlı kullanıcı yönetimi

- **Öncelik:** P0 (v1.0 sonrası ilk özellik dilimi)
- **Durum:** Alıcı kayıt/giriş dilimi tamamlandı. Unit/API/component ve gerçek Keycloak E2E testleri geçiyor; yinelenen e-posta için genel hata mesajı uygulanıp hesap keşfi engellendi.
- **Kullanıcı hikâyesi:** Bir ziyaretçi olarak e-posta ve parolamla alıcı hesabı oluşturmak, giriş yapmak ve alışverişe başlamak istiyorum. Mağaza yöneticisi olarak da alıcı, satıcı ve admin yetkilerinin güvenli biçimde ayrılmasını istiyorum.
- **Ön koşul:** Keycloak yerel geliştirme ortamında çalışır; web istemcisi ve API için OIDC istemci yapılandırması vardır.

### Profil ve yetki modeli

| Rol/profil | İlk dilimde atama | Yetki sınırı |
|---|---|---|
| `buyer` (alıcı) | Herkese açık başarılı kayıtta otomatik atanır | Ana sayfa ve ürün kataloğunu görüntüler; yalnızca kendi kullanıcı verilerine erişir. |
| `seller` (satıcı) | REQ-007'de admin onayı ve başarılı Keycloak provisioning sonrasında atanır; self-registration ile atanamaz | Admin onaylı başvurusu gerekir; kendi ürünlerini yönetebilir, diğer seller ürünlerini değiştiremez. |
| `admin` (platform yöneticisi) | Yalnızca güvenilir Keycloak yönetim kanalıyla; self-registration ile atanamaz | Mağaza genelindeki ürün CRUD yetkileri admin rolündedir. Rol kullanıcı profilinden veya istemci isteğinden değiştirilemez. |

Roller kullanıcı kategorilerini anlatır; satıcı organizasyonu ve birden fazla çalışan/alt rol desteği bu dilimin kapsamı değildir. Backend her istekte doğrulanmış token'daki yetkiyi denetler; yalnızca frontend'de eylem gizlemek yetkilendirme sayılmaz.

### Kabul kriterleri

1. Ziyaretçi e-posta ve parola ile Keycloak'ın kayıt akışından alıcı hesabı oluşturabilir; başarılı kayıt `buyer` rolü verir ve uygulamada oturum açma/ana sayfaya ilerleme imkânı sağlar.
2. Kayıt formu e-posta ve parolayı uygulama backend'ine göndermez; kimlik bilgileri yalnızca Keycloak tarafından işlenir. OIDC tarayıcı akışında Authorization Code + PKCE kullanılır.
3. E-posta benzersizliği Keycloak tarafından korunur. Var olan e-posta ile tekrar kayıt ve geçersiz/eksik alanlar kullanıcıya güvenli, anlaşılır hata verir; hesap/kimlik bilgisi ayrıntıları gereksiz yere açığa çıkarılmaz.
4. İlk sürümde e-posta doğrulaması zorunlu değildir. Kayıt sonrasında doğrulanmamış e-posta ile giriş engellenmez.
5. Parola sıfırlama, e-posta doğrulama, sosyal giriş ve MFA ilk dilimde sunulmaz; satıcı başvurusu REQ-007'de ayrı bir dilimdir.
6. Kullanıcı kayıt isteğinde `seller` veya `admin` talep etse bile rol yükseltemez. Yeni alıcı hesabı sadece `buyer` olur; ayrıcalıklı roller yalnızca güvenilir yönetim kanalından atanabilir.
7. FastAPI yalnızca yapılandırılmış Keycloak issuer'ından gelen, imzası ve `iss`, `aud`, süre/aktiflik kontrolleri doğrulanmış access token'ları kabul eder. Eksik, bozuk, süresi dolmuş veya yanlış issuer/audience token `401` döndürür.
8. Backend rol/yetki denetimi uygular: alıcı ürün CRUD yapamaz (`403`); admin mevcut ürün CRUD işlemlerini sürdürebilir; kullanıcı kendi sepeti/siparişi gibi kişisel kayıtlar eklendiğinde yalnızca kendisininkine erişebilir.
9. Keycloak'ın kapalı veya erişilemez olması başarılı kayıt/giriş gibi gösterilmez; kullanıcıya güvenli hata gösterilir ve uygulama hatayı gözlemlenebilir biçimde kaydeder.
10. Mevcut ürün kataloğu ve admin ürün yönetimi akışları Keycloak entegrasyonundan sonra da çalışır; önceki rol/yetkisiz erişim davranışları regresyon testleriyle korunur.

### Dışarıda bırakılanlar

- E-posta adresi doğrulama, parola sıfırlama/değiştirme, MFA, sosyal giriş ve gelişmiş oturum/cihaz yönetimi.
- Şirket/kimlik/KYC kontrolü, banka/ödeme bilgileri, satıcı çalışanları ve gelişmiş mağaza profili.
- Admin kullanıcı arayüzü veya kullanıcıların kendi rollerini yönetmesi.
- Müşteri adresi ve ödeme aracı toplama.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-006-T1 | Keycloak entegrasyon/E2E | Geçerli alıcı kaydı ve sonraki giriş | Keycloak kaydı ve yeniden giriş başarılıdır; yeni hesap yalnızca `buyer` olur |
| REQ-006-T2 | Keycloak entegrasyon/E2E negatif | Aynı e-posta ile ikinci kayıt | Tekil hesap kuralı korunur, kullanıcıya genel hata gösterilir ve e-posta/hesap varlığı açıklanmaz |
| REQ-006-T3 | Keycloak entegrasyon/E2E negatif | Eksik/bozuk e-posta, zorunlu alan veya eşleşmeyen parola | Kayıt reddedilir; alan hatası gösterilir, hesap/oturum oluşturulmaz |
| REQ-006-T4 | Güvenlik/entegrasyon | Self-registration sırasında `seller`/`admin` rolü talep etme | Varsayılan rol `buyer` kalır; istemci rol yükseltemez |
| REQ-006-T5 | API negatif | Yok, bozuk, süresi dolmuş veya yanlış `iss`/`aud` access token | `401`; korumalı veri/işlem açığa çıkmaz |
| REQ-006-T6 | API yetki | Alıcı ürün create/update/delete ister | `403`; ürün verisi değişmez |
| REQ-006-T7 | API yetki | Güvenilir admin token'ı ile ürün CRUD | Mevcut admin davranışı korunur |
| REQ-006-T8 | Component/unit | OIDC kayıt/login yönlendirmesi, callback iptali/bozulması ve Keycloak erişim hatası | Yönlendirme doğru başlar; callback parametreleri temizlenir; hata başarı gibi gösterilmez |
| REQ-006-T9 | E2E | Yeni e-posta ile tarayıcıdan kayıt ve giriş | Keycloak yönlendirmesi, alıcı oturumu ve katalog görünümü çalışır |
| REQ-006-T10 | E2E negatif | Alıcıyla admin işlemi denemesi | Yönetim eylemi görünmez ve API isteği `403` ile reddedilir |
| REQ-006-T11 | E2E gizlilik | Kayıt ve giriş sırasında uygulama API çağrıları | Alıcı parolası mağaza API'sine gönderilmez |

**Test katmanı izlenebilirliği:** Barındırılan Keycloak kayıt formunun başarılı/negatif davranışları gerçek yerel realm ile E2E seviyesinde; token doğrulama/rol kuralları unit ve API seviyelerinde; OIDC yönlendirme/callback davranışları component seviyesinde doğrulanmıştır. Admin CRUD regresyonu gerçek Keycloak admin rolüyle, geçici ve test sonunda silinen hesaplarla doğrulanır; admin ve buyer ürün DB'si izole geçici SQLite dosyasıdır. Yerel uygulama parola formu sunmadığından kayıt formu component testleriyle taklit edilmemelidir. E2E testleri benzersiz ve geçici hesap/parola kullanır; üretim hesabı kullanılmaz.

**QA/güvenlik kararı:** Keycloak'ın varsayılan yinelenen kullanıcı/e-posta mesajı hesap keşfine (account enumeration) imkân verebildiğinden custom `liva` login theme ile genel hata mesajına dönüştürülmüştür. Bu davranış gerçek Keycloak E2E testiyle doğrulanır.

**Sıralı kullanıcı yönetimi dilimleri:** Alıcı kayıt/login (REQ-006) ve satıcı başvurusu (REQ-007) dilimleri tamamlandı. REQ-008 kapsamı, admin rolünün yalnızca güvenilir Keycloak Admin Console operatörünce yönetilmesi olarak kararlaştırıldı; uygulama içi admin yönetimi bu kapsamda değildir.

## REQ-007 — Satıcı başvurusu ve ilk inceleme

**Öncelik:** P0 (v1.0 sonrası ilk kullanıcı yönetimi dilimi)
**Durum:** Tamamlandı. Başvuru API/veri modeli, admin inceleme ekranı, satıcıya ait ürün yönetimi ve Keycloak rol provisioning uygulandı; migration, API/component ve gerçek Keycloak E2E testleri geçti. Alıcı rolü korunur, satıcı ürünü ortak katalogda görünür ve yalnızca sahibi yönetebilir.
**Kullanıcı hikâyesi:** Giriş yapmış bir alıcı olarak mağaza açmak için başvurmak ve başvurumun durumunu takip etmek istiyorum. Platform yöneticisi olarak başvuruyu inceleyip gerekçeli karar vermek istiyorum.
**Ön koşul:** Kullanıcı Keycloak üzerinden giriş yapmış ve yalnızca `buyer` rolüne sahip olmalıdır.

### Pazar yeri araştırması ve proje kararı

Amazon'ın resmi ABD satıcı kayıt rehberi işletme konumu/türü/adı, şirket kayıt bilgisi ve adresi, birincil irtibat, banka/kart bilgisi, mağaza/ürün bilgisi ve kimlik doğrulaması adımlarını anlatır; kimlik, işletme kaydı/lisansı, adres kanıtı ve vergi bilgisini kayıt hazırlıkları arasında sayar. Amazon'ın ülkeye ve hesap türüne göre gereklilikleri değişebilir; bu ABD rehberi Türkiye için yasal gereklilik olarak yorumlanmamalıdır.

Trendyol'un resmi Partner Portalı satıcılar için ayrı bir iş yüzeyi olduğunu gösterir. Portalın kamuya açık içeriği JavaScript/oturum gerektirdiği için başvuru alanları, iç durum akışı veya doğrulama kuralları bağımsız olarak doğrulanamamıştır. Bu gereksinim Trendyol'un iç uygulamasını kopyaladığını iddia etmez.

**Kaynaklar (31 Ekim 2026):**

- [Amazon — How to sell on Amazon](https://sell.amazon.com/sell) (ABD satıcı kayıt rehberi; ülkeye göre değişiklik gösterebilir).
- [Trendyol Partner Portalı](https://partner.trendyol.com/) (JavaScript/oturum gerektirir; iç başvuru adımları kamuya açık olarak doğrulanamadı).

**Öğrenme projesi kararı:** Başvurular bireysel satıcı, şahıs işletmesi ve şirket türlerini seçebilir. Form yalnızca temel beyanları alır; kimlik/vergi numarası, banka bilgisi ve belge dosyası toplamaz. Yetkili admin beyan edilen bilgileri manuel inceler. `approved`, formal KYC/sicil doğrulaması veya hukuki uygunluk anlamına gelmez; yalnızca uygulama içindeki mock marketplace satıcı yetkilerini açar. Gerçek KYC/KYB entegrasyonu, yasal uygunluk teyidi, PSP/para hareketi ve kargo/taşıyıcı entegrasyonu bu projenin kapsamı dışındadır.

### Başvuru alanları

Keycloak `sub` ve e-posta bilgisi doğrulanmış access token'dan alınır; istemciden gelen kullanıcı kimliği/e-posta yetki kaynağı olarak kullanılmaz. Parola bu akışa dahil değildir.

| Alan | Kural | Gizlilik/amaç |
|---|---|---|
| `applicant_type` | Zorunlu enum: `individual`, `sole_proprietor`, `company` | Başvurunun beyan edilen işletme türü; uygunluk kararı değildir. |
| `legal_name` | Zorunlu, 2–120 karakter; bireyselde yasal ad-soyad, işletmede yasal/tescilli unvan | Yasal adı işletme unvanından ayırt eder. |
| `representative_name` | Şirket için zorunlu, 2–120 karakter; diğer türlerde isteğe bağlı | Başvuruyu yapan yetkili irtibat kişisi. |
| `store_name` | Zorunlu, 2–64 karakter; Unicode harf/rakam, boşluk, tire ve kesme işareti; trim ve ardışık boşluk normalizasyonu | Mağaza için görünen ad; normalize edilmiş adı başka aktif/onaylı başvuruda kullanılamaz. |
| `contact_phone` | Zorunlu; `+` ve 8–15 rakam, ilk rakam sıfır olamaz; boşluk ve ayraç kabul edilmez | Başvuru ve inceleme iletişimi; Keycloak e-postası token'dan okunur. |
| `city`, `district` | Zorunlu; her biri 2–80 karakter | Operasyon bölgesini belirler; tam açık adres toplanmaz. |
| `primary_category` | Zorunlu, 2–80 karakter | Satıcının beyan ettiği ana ürün grubu; ürün katalog kategorileriyle eşleşme garantisi vermez. |
| `business_description` | Zorunlu, 20–1000 karakter; yazdırılabilir metin | Başvurunun amacını ve satılacak ürünleri özetler. |

`tax_id`, T.C. kimlik numarası, MERSİS/ticaret sicil numarası, banka/kart bilgisi, kimlik veya işletme belgesi, tam adres ve belge görselleri bu dilimde istenmez ve saklanmaz. Bireysel başvuru seçeneği, kişinin mevzuat uyarınca satıcı olarak faaliyete uygun olduğu anlamına gelmez.

### Başvuru durumları ve geçişler

| Durum | Anlam |
|---|---|
| `draft` | Başvuru sahibi henüz göndermedi; alanları düzenleyebilir. |
| `submitted` | Başvuru inceleme kuyruğuna gönderildi. |
| `under_review` | Admin incelemeyi başlattı. |
| `changes_requested` | Admin eksik/yanlış beyanları ve kullanıcıya gösterilecek açıklamayı iletti; başvuru sahibi düzeltip yeniden gönderebilir. |
| `approval_pending` | Admin olumlu kararı verdi; Keycloak `seller` rolü ataması tamamlanmadı. Satıcı yetkisi verilmez ve işlem güvenle yeniden denenebilir. |
| `approved` | Keycloak rol ataması doğrulandı; başvuru sahibi yeni oturum/token aldığında `seller` rolüyle satıcı alanına erişebilir. Bu, formal KYC veya satış yetkisi değildir. |
| `rejected` | Admin gerekçe kodu ve kullanıcıya uygun açıklamayla reddetti. Yeniden başvuru yeni kayıt olarak yapılır; eski kayıt/audit izi korunur. |
| `withdrawn` | Başvuru sahibi henüz karar verilmemiş başvuruyu geri çekti. |

İzin verilen ana geçişler: `draft → submitted → under_review`; incelemede `changes_requested`, `approval_pending` veya `rejected`; `changes_requested → submitted`; `approval_pending → approved` yalnızca Keycloak rol ataması başarıyla doğrulandıktan sonra. `draft`, `submitted` ve `changes_requested` başvuru sahibi tarafından geri çekilebilir. Onay/red/geri çekme sonrasında aynı kayıt değiştirilemez. Geçersiz geçiş reddedilir. Kullanıcı başına aynı anda en fazla bir aktif başvuru bulunur; ret sonrası yeni başvuru yeni kimlikle açılır.

Keycloak erişim/rol atama hatasında işlem başarı gibi raporlanmaz; başvuru `approval_pending` kalır, kullanıcı satıcı yetkisi kazanmaz ve admin yeniden deneyebilir. Rol atama tekrarı idempotent olmalı; yalnızca başarılı rol eşlemesi ve doğrulanmış sonuçtan sonra `approved` yapılmalıdır. Rol değişikliği audit kaydında başvuru, karar veren admin, zaman ve sonuç tutulur; token claim'i sonraki token yenileme/yeni oturumda görünür.

### Kabul kriterleri

1. Yalnızca kimliği doğrulanmış `buyer` kendi başvurularını oluşturabilir, okuyabilir ve uygun durumda düzenleyebilir; `seller`/`admin` rolü talep eden payload yetki vermez.
2. Başvuru Keycloak `sub` değerine bağlanır. Kullanıcı başka bir başvuruya erişemez; istemcinin gönderdiği owner ID/e-posta yok sayılır veya reddedilir.
3. Alanlar tür, uzunluk, biçim ve normalize edilmiş mağaza adı benzersizliği açısından doğrulanır. Geçersiz istek `422` alır ve kayıt yaratmaz/değiştirmez.
4. Başvuru sahibi yalnızca `draft` ve `changes_requested` durumlarında form alanlarını düzenleyebilir; gönderilmiş/incelemedeki/onaylanmış/reddedilmiş kayıt doğrudan değiştirilemez.
5. Kullanıcı başvuru durumunu ve kendisine gösterilmesi güvenli inceleme notunu görür; admin iç notları, başka başvuru verileri ve hassas sistem hataları görünmez.
6. Yetkili admin başvuruyu incelemeye alabilir, eksik bilgi isteyebilir, reddedebilir veya onay sürecini başlatabilir. Admin olmayan kullanıcı bu işlemlerde `403` alır.
7. `seller` rolü başvuru gönderiminde veya incelemede verilmez. Admin onayı sonrasında Keycloak rol ataması başarılı olunca durum `approved` olur; mevcut `buyer` rolü korunur ve yeni token/oturumda her iki rol bulunur.
8. Keycloak rol ataması başarısızsa durum `approval_pending` kalır, hata izlenebilir biçimde raporlanır ve kullanıcı/admin başarı mesajı almaz; tekrar deneme ikinci bir rol veya kayıt yaratmaz.
9. Başvuru sahibinin başvuru başına bir aktif kayıt kuralı korunur; `rejected`/`withdrawn` başvurular geçmiş olarak saklanır ve yeni başvuru yeni kayıt olur.
10. Onaylı seller bu dilimde yalnızca kendisine ait ürünleri ekleyebilir, düzenleyebilir ve silebilir; buyer rolüyle ortak katalogdaki ürünleri görüntülemeye devam eder. Admin tüm ürünleri yönetebilir. Başka seller'a ait ürün seller için bulunmuyor gibi (`404`) yanıtlanır.
11. Yeni seller ürünü onaylı satıcı tarafından kaydedildiğinde ortak katalogda anında görünür; ürün başına ikinci bir admin moderasyon aşaması yoktur. Bu, ürünün yasal satış/ödeme için uygun olduğunu garanti etmez.
12. Uygulama yalnızca başvuru kararını ve temel beyanları yönetir; bu gereksinim formal KYC/işletme sicili kontrolü, belge depolama, ödeme alma veya yasal satıcı uygunluğu garantisi vermez.
13. Başvuru ve audit yanıtları parolayı, token'ı, T.C. kimlik/vergi/banka verisini veya belge içeriğini içermez; böyle hassas alanlar bu dilimde toplanmaz.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-007-T1 | Unit | Başvuru enum, zorunlu/koşullu alan ve uzunluk/telefon/Unicode doğrulaması | Geçerli türler kabul; sınır dışı/eksik veri reddedilir |
| REQ-007-T2 | Unit | Başvuru durum makinesi | İzinli geçişler başarılı; terminal/geçersiz geçişler reddedilir |
| REQ-007-T3 | API | Buyer taslak oluşturur/görüntüler/günceller/gönderir | `201/200`; owner token `sub` üzerinden atanır, rol aynı kalır |
| REQ-007-T4 | API negatif | Anonim, admin olmayan review, seller/admin rolü talebi veya başka kullanıcının ID'si | `401/403`; veri ve roller değişmez |
| REQ-007-T5 | API negatif | İkinci aktif başvuru, duplicate normalize store name, geçersiz durum güncellemesi | Conflict/validation yanıtı; mevcut başvuru korunur |
| REQ-007-T6 | API/privacy | Buyer başvuru durumunu ve detayını okur | Yalnızca kendi güvenli alanları döner; admin iç notu/başka başvuru yoktur |
| REQ-007-T7 | DB/migration | Başvuru şeması, FK/unique kısıtları, upgrade/downgrade ve rollback | Owner ve aktif başvuru kuralları korunur; yarım veri kalmaz |
| REQ-007-T8 | Keycloak entegrasyon | Admin onayı ve seller rol atama | Başarılı eşlemeden sonra `approved`; yeni token `seller` içerir |
| REQ-007-T9 | Keycloak negatif | IdP kapalı/rol ataması başarısız/tekrar deneme | `approval_pending`, seller erişimi yok; idempotent retry sonunda tek başarılı atama |
| REQ-007-T10 | Component | Buyer başvuru formu ve durum ekranı | Alan hataları, yükleniyor/başarı/hata, changes-requested düzenleme görünür |
| REQ-007-T11 | Component | Yetkisiz review kontrolleri | Buyer'a admin karar eylemleri gösterilmez; API hatası güvenli görünür |
| REQ-007-T12 | E2E | Gerçek Keycloak buyer başvurur, admin inceler ve onaylar | Gönderimden önce seller rolü yok; onay sonrası yeniden kimlik doğrulamayla seller rolü görünür |
| REQ-007-T13 | E2E/regresyon | Admin olmayan kullanıcı başka başvuruyu inceler/onaylar; onaysız buyer seller alanına erişir | UI/endpoint engeli ve `403`; başvuru/ürün katalog verisi değişmez |
| REQ-007-T14 | Güvenlik/regresyon | Hassas alan sızıntısı ve mevcut buyer/CRUD akışları | Yanıt/loglarda credential veya toplanmayan belge/kimlik verisi yok; önceki kayıt ve ürün CRUD E2E'leri geçer |

**Test katmanı izlenebilirliği:** `apps/api/tests/test_seller_applications.py` başvuru/karar API ve hata davranışlarını; `apps/api/tests/test_keycloak_admin.py` servis istemcisi rol provisioning davranışını; `apps/api/tests/test_seller_migration.py` migration upgrade/downgrade'ını; `apps/web/src/api.test.ts` HTTP sözleşmesini; `apps/web/src/App.test.tsx` başvuru/admin/seller arayüzü ve ürün sahipliği görünürlüğünü doğrular. `apps/web/e2e/seller-applications.spec.ts` gerçek Keycloak buyer başvurusunu, admin onayını, yeni oturumda buyer+seller rollerini, satıcının ürün oluşturmasını ve başka buyer'ın ortak katalogda ürünü salt-okunur görmesini doğrular. Gerçek Keycloak E2E ile mevcut buyer kayıt/login ve admin/buyer CRUD regresyonları geçti.

## REQ-008 — Güvenilir kanaldan admin rolü yönetimi

- **Öncelik:** P1
- **Durum:** Tamamlandı; operasyon dokümantasyonu, realm audit ayarı ve API/config/E2E regresyonları doğrulandı.
- **Kullanıcı hikâyesi:** Güvenilir platform operatörü, uygulama kullanıcılarının kendilerini admin'e yükseltemediğinden emin olarak admin erişimini kontrollü biçimde atayıp geri alabilmek istiyor.
- **Kapsam kararı:** İlk admin'in bootstrap'i, sonraki admin rol ataması ve rolün kaldırılması yalnızca güvenilir operatörün Keycloak Admin Console işlemleridir. Mağaza UI'ında admin kullanıcı yönetimi ve admin rolü atayan/kaldıran uygulama API'si oluşturulmayacaktır.
- **Son admin kuralı:** Admin rolü kaldırılmadan veya admin hesabı kapatılmadan önce başka bir etkin admin bulunduğu operatör tarafından doğrulanmalı; ayrı ve güvenli break-glass operatör hesabı korunmalıdır. Keycloak Admin Console bu son-admin kontrolünü kendiliğinden zorlamaz; bu dilimdeki kontrol operasyonel prosedürdür, otomatik teknik bloklama değildir.
- **Audit:** Keycloak admin olayları açık olmalı; olay ayrıntıları/payload'ları kapalı tutulmalıdır. Kalıcı realm'lerde bu ayar ayrıca uygulanır ve olay kayıtlarına erişim kısıtlanır.

### Kabul kriterleri

1. İlk admin yalnızca Keycloak Admin Console'a erişimi olan güvenilir operatör tarafından atanır; uygulama/realm self-registration yeni kullanıcıya yalnızca `buyer` verir.
2. Sonraki admin rolü verme ve geri alma işlemleri yalnızca Keycloak Admin Console'dan yapılır. Uygulama içinde rol yönetim ekranı veya admin-role mutation API'si bulunmaz.
3. Admin rolü bir isteğin body/query/path alanıyla verilemez; buyer veya seller kendi token rolünü değiştiremez ve admin API'lerine yetkisiz erişim alamaz.
4. Admin rolü geri alınan kullanıcı, yeni access token aldığında `admin` claim'ine sahip olmaz; mevcut token'ın süresi dolana/oturum yenilenene kadar eski claim davranışı ayrıca dikkate alınır.
5. Admin rolü kaldırılmadan veya admin kullanıcısı devre dışı bırakılmadan önce başka etkin admin bulunduğu operatör kontrol listesiyle doğrulanır; ayrı break-glass erişimi korunur. Bu manuel prosedür, Keycloak'ın kendi teknik son-admin kilidi olarak sunulmaz.
6. Keycloak admin-event kaydı açık, event detayları kapalıdır; rol atama/kaldırma olaylarının aktör ve olay türü kayıt altına alınabilir, gizli değerler olay detaylarına yazılmaz.
7. Admin rolü olmayan kullanıcıların mevcut admin-only API işlemleri `403` döndürür; admin CRUD ve satıcı başvurusu onayının Keycloak admin rolü ile çalışması regresyon testleriyle korunur.

### Geliştirme ve test planı

- **Keycloak yapılandırma:** Realm export admin event kaydını açıp event detaylarını kapalı tutar. Persistent realm için Admin Console üzerinden uygulanacak adımlar belgelenir.
- **Unit/config:** Realm testleri public kayıt varsayılanının yalnızca `buyer` olduğunu, `admin` rolünün varsayılan olmadığını ve admin-event ayarlarını doğrular.
- **API/regresyon:** Admin olmayan kullanıcının admin ürün/başvuru-review işlemlerini yapamadığı mevcut API testleri korunur; kullanıcı girdisiyle rol yükseltme endpoint'i olmadığı doğrulanır.
- **Keycloak entegrasyon/E2E:** Gerçek Keycloak test realm'inde güvenilir test bootstrap'i admin rolü atar; admin-only davranış doğrulanır. Rol kaldırılıp yeni oturum açıldığında admin erişimi kaybolur. Test kurulumu uygulama API'si üzerinden rol atama kabiliyeti eklemez.
- **Operasyonel doğrulama:** İlk admin kurulumu, admin atama/kaldırma, son admin kontrolü ve break-glass hesabı için kısa runbook adımları dokümante edilir. Keycloak admin-event ekranında işlem ve operatörün görüldüğü hassas detay içermeyen kontrolle doğrulanır.
- **Güvenlik:** Secret, token veya kullanıcı kimlik bilgileri test çıktısına/loglara düşmez; rol değişikliği için yeni token/oturum gerektiği belgelenir.

**Çıkış ölçütü:** Admin yetkisi yalnızca güvenilir Keycloak yönetim kanalından verilir/alınır; public kayıttan rol yükseltilemez; admin olay kaydı hassas ayrıntı saklamadan etkin; son admin kontrolü açıkça operasyonel ve manuel olarak uygulanır; API ve Keycloak regresyonları geçer.

## REQ-009 — Müşteri sepeti

- **Öncelik:** P1
- **Durum:** Tamamlandı. Backend SQLite regresyonunda 213, ayrı PostgreSQL entegrasyonunda 6 test geçti; birleşik backend koşusu 219/219 başarılı ve coverage %99,47. Frontend'de 128 test, %100 statement/branch/function/line coverage; gerçek Keycloak E2E 8/8 geçti. PostgreSQL migration, eşzamanlı ilk sepet oluşturma ve alıcı bazlı stok sınırı doğrulandı.
- **Kullanıcı hikâyesi:** Giriş yapmış bir alıcı olarak ürünleri sepete ekleyip miktarlarını değiştirmek veya kaldırmak istiyorum; böylece satın almadan önce seçimlerimi gözden geçirebilirim.
- **Kimlik ve sahiplik:** Sepet Keycloak `sub` değeriyle kullanıcıya bağlanır. İstemci sepet sahibi veya başka kullanıcıya ait sepet kimliği gönderemez. Alıcı rolü olmayan oturumlar sepet API'sine erişemez.
- **Tekrar ekleme:** Sepetteki ürünü yeniden ekleme mevcut satırın miktarını artırır; aynı ürün için ikinci satır oluşmaz.
- **Fiyat:** Sepet ürünün güncel katalog fiyatını gösterir; sepete ekleme anındaki fiyat sabitlenmez. Sipariş/checkout aşamasında fiyat ayrıca doğrulanır.
- **Stok:** Ekleme ve miktar güncelleme sırasında güncel stok kontrol edilir. Stok yetersizliği değişikliği reddeder; başarılı olmayan değişiklik veritabanına yazılmaz. Sepet stok rezervasyonu değildir; farklı alıcıların sepet toplamı mevcut stoğu aşabilir. Checkout kendi atomik stok doğrulamasını ayrıca yapacaktır.
- **Silinmiş ürün:** Ürün silindiğinde sepet satırı korunur, kullanılamaz olarak gösterilir ve yalnızca sepetten kaldırılabilir. Sepet özeti kullanılabilir ürünlerin güncel fiyatlarından hesaplanır; kullanılamaz satır toplam tutara eklenmez.

### Kabul kriterleri

1. Alıcı `GET /api/v1/cart` ile yalnızca kendi sepetini görür; sepeti yoksa boş sepet ve sıfır toplam döner.
2. `POST /api/v1/cart/items` ürün kimliği ve pozitif tam sayı miktarını alır. Ürün bulunamaz/silinmişse `404`, miktar geçersizse `422`, stok yetersizse `409` döner.
3. Aynı ürün yeniden eklenince mevcut miktar artar; sonuç güncel stoğu aşacaksa `409` döner ve miktar değişmez.
4. `PUT /api/v1/cart/items/{item_id}` yalnızca kullanıcının satırını günceller. Pozitif tam sayı ve stok sınırları uygulanır; silinmiş ürün satırı değiştirilemez.
5. `DELETE /api/v1/cart/items/{item_id}` yalnızca kullanıcının satırını siler. Başka kullanıcıya ait veya bulunmayan satır `404` döner.
6. İstek kimliği bulunmayan/geçersiz token için `401`; buyer rolü olmayan kullanıcı için `403` döner. Uygulama subject'i istek gövdesinden veya path'inden almaz.
7. Yanıtta satır kimliği, ürün kimliği (ürün silinmişse `null`), ürün adı, mevcutsa güncel birim fiyatı, miktar, stok/uygunluk durumu ve satır tutarı yer alır. Sepet toplamı silinmiş veya stok dışı kalmış ürünleri dahil etmez.
8. Ürün fiyatı veya stoğu değişince bir sonraki sepet okuması güncel bilgiyi yansıtır. Başarısız mutation hiçbir kısmi miktar değişikliği bırakmaz.
9. Sepet kalemleri migration ile kalıcılaşır; ürün silme kalemi silmez, ürün referansı `null` olur ve son bilinen ürün adı korunur. Migration downgrade cart tablolarını bağımlılık sırasına göre kaldırır.
10. Ürün kataloğundan sepete ekleme, sepeti görüntüleme, miktarı değiştirme ve kalemi kaldırma UI'dan yapılabilir; boş, yükleniyor, hata ve stok uyuşmazlığı durumları kullanıcıya bildirilir.

### API sözleşmesi

- `GET /api/v1/cart` — alıcının sepeti.
- `POST /api/v1/cart/items` — `{ "product_id": 1, "quantity": 1 }`; aynı üründe miktar eklenir.
- `PUT /api/v1/cart/items/{item_id}` — `{ "quantity": 2 }`; miktarı belirtilen değere ayarlar.
- `DELETE /api/v1/cart/items/{item_id}` — başarılı durumda `204`.
- Miktarlar pozitif tam sayıdır. Fiyat ve satır toplamı backend'de güncel ürün fiyatıyla hesaplanır; istemciden fiyat/toplam kabul edilmez.

### Geliştirme ve test planı

- **Unit/şema:** Katı pozitif tam sayı miktarı, ürün ve satır yanıtı, güncel fiyat/ara toplam/uygunluk hesapları ve silinmiş ürün temsili.
- **API/entegrasyon:** Listele/ekle/tekrar ekle/güncelle/sil; anonim ve buyer olmayan kullanıcı; başka kullanıcı kalemi; olmayan/silinmiş ürün; invalid miktar; stok sınırı; fiyat/stock değişikliği; işlem hatasında rollback.
- **DB/migration:** Benzersiz cart-owner ve cart/product ilişkileri, pozitif miktar ve FK davranışı; migration upgrade/downgrade; ürün silinince cart item'ın korunması; eşzamanlı cart mutation ve stok kontrolü.
- **PostgreSQL entegrasyon:** Ayrı `_test` veritabanında gerçek migration; eşzamanlı ilk sepet oluşturma ve aynı alıcının stok sınırı; farklı alıcıların stok rezervasyonu olmadan sepet kullanımı; silinen ürün FK davranışı ve benzersiz cart-item kısıtı. Bu testler SQLite regresyon paketinden bağımsızdır.
- **Component:** Katalogdan ekleme, sepet özeti, miktar güncelleme/kaldırma, boş/yükleniyor/hata/stok çakışması durumları ve API hatalarının erişilebilir bildirimi.
- **E2E:** Gerçek Keycloak alıcısı ürün ekler, miktarı değiştirip siler; başka kullanıcı sepeti göremez; yenileme sonrası sepet kalıcılığı ve ürün silinmesi sonrası kullanılamaz satır davranışı doğrulanır.

**Çıkış ölçütü:** Alıcı yalnızca kendi sepetini düzenler; hatalı, stok dışı veya yetkisiz mutation kalıcılaşmaz; stok ve miktar kuralları backend transaction'ı içinde kontrol edilir; regresyon ve migration kapıları geçer.

## REQ-010 — Sipariş oluşturma

- **Öncelik:** P1
- **Durum:** Tamamlandı. Backend SQLite ve PostgreSQL testleri 231/231 geçti, coverage %99,54; web testleri 141/141 ve %100 coverage; checkout içeren Keycloak E2E 8/8, frontend build, Oxlint ve Ruff kontrolleri başarılı.
- **Kullanıcı hikâyesi:** Giriş yapmış bir alıcı olarak uygun sepetimi siparişe dönüştürmek ve daha sonra siparişimin satın alma anındaki ayrıntılarını görebilmek istiyorum.
- **Kapsam:** Tek adımlı checkout, sipariş oluşturma/onayı ve alıcı sipariş geçmişi. Adres/teslimat ve ödeme sağlayıcısı REQ-011/sonraki dilimlerin kapsamındadır.
- **Stok ve sipariş durumu kararı:** Checkout anında ürün ve stok satır kilitleriyle doğrulanır; her kalemin güncel stok miktarı aynı transaction içinde düşülür. Yeni sipariş `pending_payment` durumunda oluşturulur. Bu aşamada ödeme alınmaz; ödeme sonucu ve başarısız/terk edilmiş siparişlerde stok iadesi REQ-011 kapsamında ele alınır.
- **Sepet kararı:** Sipariş ve tüm sipariş kalemleri başarılı biçimde kaydedildikten sonra sepet kalemleri aynı transaction içinde silinir. Başarısız checkout sepeti korur.
- **Idempotency kararı:** `POST /api/v1/orders` zorunlu `Idempotency-Key` başlığı alır. Aynı alıcının aynı anahtarla tekrarı yeni sipariş yaratmadan ilk siparişin aynısını döndürür; farklı alıcılar anahtarı bağımsız kullanabilir.
- **Fiyat/snapshot:** İstek gövdesinden fiyat veya toplam alınmaz. Sunucu kilitlediği güncel ürün ve stok kayıtlarını doğrular; ürün adı, birim fiyat, miktar, satır toplamı ve sipariş toplamı sipariş anında snapshot olarak saklanır. Ürün sonradan güncellense/silinse sipariş geçmişi değişmez.

### Kabul kriterleri

1. Yalnızca buyer rolündeki kimliği doğrulanmış kullanıcı sipariş oluşturabilir ve yalnızca kendi sipariş geçmişini görebilir.
2. `POST /api/v1/orders` boş gövde ve zorunlu, biçimi/uzunluğu doğrulanmış `Idempotency-Key` başlığıyla çalışır; istemciden fiyat/toplam kabul edilmez.
3. Boş sepet, silinmiş ürün veya sepet miktarını karşılamayan güncel stok durumunda `409` döner; sipariş, stok ve sepet kalıcı durumu değişmez.
4. Başarılı checkout bütün kalemler için sipariş snapshot'ı üretir, tutarları güncel katalog fiyatından hesaplar, stokları düşer, durumu `pending_payment` yapar ve sepet kalemlerini tek DB transaction'ında temizler.
5. Aynı alıcının aynı idempotency anahtarıyla eşzamanlı/tekrarlı istekleri tek siparişe karşılık gelir ve aynı sipariş yanıtını döndürür.
6. İki alıcının eşzamanlı checkout'ı aynı son stok için yarışırsa stok negatif olmaz; yalnızca stok koşulunu sağlayan sipariş oluşur, diğeri `409` alır.
7. Oluşan sipariş ve kalem snapshot'ları alıcının sipariş geçmişinde sıralı ve tutarlı biçimde sunulur. Sipariş başka alıcı tarafından okunamaz; bulunmayan veya başka kullanıcıya ait kimlik `404` döner.
8. Bir ürün sonradan güncellense veya silinse bile sipariş adı/fiyat/adet/toplam snapshot'ı korunur.
9. Herhangi bir DB/transaction hatasında sipariş, kalemler, stok düşümü ve sepet temizliği birlikte rollback edilir.
10. UI sepetten sipariş başlatır; onay/işlemde/hata/başarı durumlarını gösterir, başarıda sepeti günceller ve yeni siparişi görünür kılar. Ağ hatasında tekrar deneme aynı idempotency anahtarını kullanır.

### API sözleşmesi

- `POST /api/v1/orders` — buyer token ve `Idempotency-Key` başlığı; istek gövdesi yok; başarılı ilk istek `201`, aynı anahtarın tekrarı aynı siparişle `200`.
- `GET /api/v1/orders` — yalnızca oturum sahibinin sipariş geçmişi.
- `GET /api/v1/orders/{order_id}` — yalnızca oturum sahibinin sipariş ayrıntısı.
- Yanıt sipariş kimliği/durumu/tarih/toplam ve her kalemin ürün adı, ürün kimliği (ürün silinmişse `null`), birim fiyat snapshot'ı, miktarı ve satır toplamını içerir.

### Geliştirme ve test planı

- **Unit/şema:** Sipariş durum enum'u, snapshot/ara toplam/toplam hesapları, para yuvarlama ve idempotency başlığı doğrulaması.
- **SQLite API/regresyon:** Buyer yetkisi/sahipliği, boş sepet, geçersiz anahtar, güncel fiyat/stok, silinmiş ürün, duplicate replay, başka alıcı erişimi, ürün güncelleme/silme sonrası snapshot.
- **DB/transaction:** Sipariş + kalem + stok azaltımı + sepet temizliği atomikliği; her yazma aşamasında enjekte edilmiş hata ve rollback; migration upgrade/downgrade/kısıtlar.
- **PostgreSQL entegrasyon:** Gerçek migration ve eşzamanlı aynı anahtar/aynı alıcı checkout; iki alıcının son stok için yarışması; yalnızca bir sipariş ve tutarlı stok/sepet sonucu.
- **Component:** Checkout onayı/işlemde; başarı ve sipariş özeti; boş/uygun olmayan sepet; validation, API ve bağlantı hatası; yeniden denemede aynı anahtar.
- **E2E:** Gerçek Keycloak buyer ürün ekleyip sipariş verir ve sipariş geçmişinde görür; sepet boşalır; başka buyer siparişi okuyamaz; stok yetersiz/ürün silme negatif yolu ve tekrar gönderim doğrulanır.

**Çıkış ölçütü:** Sipariş veya ilgili stok/sepet etkileri kısmi kalmaz; sipariş fiyatı istemci verisine dayanmaz; snapshot ve sahiplik korunur; SQLite regresyonu, PostgreSQL eşzamanlılık, UI ve Keycloak E2E kalite kapıları geçer.

## REQ-011 — Ödeme entegrasyonu

- **Öncelik:** P1
- **Durum:** Mock sandbox dilimi tamamlandı ve doğrulandı: son backend varsayılan test koşusunda 239 test geçti, PostgreSQL için ayrılmış 10 test `SHOP_TEST_DATABASE_URL` ayarlı olmadığından atlandı; coverage %97,19 (eşik %95). Web 144 test/%100 coverage ve Keycloak E2E 8/8 önceki tam doğrulamada geçti; frontend build/lint, Ruff ve `git diff --check` başarılı. Gerçek PSP adapter'ı ve sandbox hesabı sağlayıcı seçimine kadar beklemede.
- **Kullanıcı hikâyesi:** Giriş yapmış bir alıcı olarak siparişimin ödemesini güvenli hosted checkout akışıyla tamamlayıp sonucunu görebilmek istiyorum.
- **Sağlayıcı kararı:** İlk dilimde gerçek sağlayıcı hesabı/kimlik bilgisi gerektirmeyen mock sandbox adaptörü kullanıldı. Gerçek PSP seçimi ve sandbox hesabı sağlandığında ilgili adapter ve sağlayıcı sözleşme testleri ayrı iş olarak eklenecek. Mock adaptör gerçek tahsilat yapmaz ve canlı sağlayıcı olarak kullanılamaz.
- **Kart verisi:** Kart numarası, CVC veya benzeri hassas ödeme bilgisi web/API uygulamasına gönderilmez, kaydedilmez veya loglanmaz. Ödeme bilgisi hosted checkout sağlayıcısının alanında girilir.
- **Ödeme penceresi:** Ödeme başlatıldıktan sonra sipariş için 2 dakikalık süre tanınır. Süre içinde kesin başarı gelmezse sipariş sona ermiş sayılır.
- **Stok iadesi:** REQ-010 checkout’ta düşülen stok, ödeme başarısız/iptal/zaman aşımına uğradığında aynı DB transaction’ında ve yalnızca bir kez geri eklenir. Başarılı ödeme stoku iade etmez.
- **Durum kararı:** Sipariş `pending_payment` iken ödeme başlatılabilir; doğrulanmış başarı siparişi `paid`, kesin başarısızlık/iptal/zaman aşımı siparişi `cancelled` yapar. Son durumdan gelen yinelenen veya ters sıradaki bildirim sipariş/stok durumunu değiştirmez.
- **Bildirim güvenliği:** Ödeme sonucu yalnızca doğrulanmış imzalı webhook veya sandbox adaptörünün eşdeğer güvenilir callback’i ile uygulanır. Webhook olay kimliği tekil/idempotent; tutar ve para birimi siparişle eşleşmelidir. Bilinmeyen/geçersiz imza reddedilir.
- **Deneme sınırı:** Her sipariş için tek ödeme kaydı oluşturulur. Başarısız/iptal/süresi dolmuş sipariş için yeni ödeme denemesi bu dilimde desteklenmez; yeniden deneme politikası ayrıca kararlaştırılmalıdır.
- **Kapsam dışı:** Gerçek PSP entegrasyonu/canlı tahsilat, iade/chargeback, sipariş iptal politikası ve geç gelen başarı bildirimleri için finansal mutabakat REQ-012 veya sağlayıcı entegrasyonu dilimine bırakılır.

### Kabul kriterleri

1. Yalnızca sipariş sahibi buyer ödeme başlatabilir; başka kullanıcının veya `pending_payment` olmayan siparişin ödemesi başlatılamaz.
2. Ödeme başlatma idempotency anahtarı alır; aynı kullanıcı/anahtar tekrarı ikinci ödeme oturumu oluşturmaz.
3. Sandbox hosted checkout'a yönlendirir; uygulama API’si kart/CVC alanı sunmaz ve kart verisi saklamaz.
4. İmzalı sağlayıcı bildirimi ödeme sonucu ile sipariş tutarı/para birimini eşleştirir; doğrulanmamış bildirim kalıcı durumu değiştirmez.
5. Başarı bildirimi siparişi `paid` yapar; yinelenen webhook aynı sonucu üretir ve stok miktarını değiştirmez.
6. Başarısız/iptal/zaman aşımı bildirimi ödeme ve siparişi sonlandırır, sipariş snapshot’ındaki hâlâ mevcut ürün stoklarını tek transaction içinde tam bir kez iade eder.
7. Geçersiz imza, bilinmeyen ödeme, tutar uyuşmazlığı, yinelenen/ters sıradaki olay güvenli biçimde reddedilir veya etkisiz tekrar yanıtı verir; ikinci kez stok iadesi/ödeme geçişi olmaz.
8. Buyer ödeme durumunu yalnızca kendi siparişleri için görebilir. Dışarıya sağlayıcı gizli anahtarı, webhook anahtarı veya kart verisi dönmez.
9. 2 dakikalık ödeme süresi dolan bekleyen siparişler sona erdirilir ve stokları bir kez serbest bırakılır; expiry işleyişi yinelenen çalışanlara karşı güvenlidir.

### API sözleşmesi ve test planı

- `POST /api/v1/orders/{order_id}/payments` — buyer token ve zorunlu `Idempotency-Key`; hosted checkout URL’si ve ödeme özeti döner.
- `GET /api/v1/orders/{order_id}/payments/{payment_id}` — yalnızca sipariş sahibi ödeme durumunu ve gerekli hosted checkout yönlendirmesini görür.
- `POST /api/v1/payments/webhook` — sağlayıcı event ID, payment reference, durum, tutar/para birimi ve sağlayıcı imzası; kart verisi payload şemasında bulunmaz.
- `/api/v1/payments/mock-checkout/{payment_id}/{token}` — mock adaptörün sentetik sonuç seçimi için hosted sandbox sayfası; gerçek ödeme veya kart girişi yoktur.
- **Tamamlanan doğrulama:** Backend SQLite/PostgreSQL 249 test ve %97,46 coverage; web 144 test ve %100 coverage; Keycloak E2E 8/8; frontend build/lint, Ruff ve `git diff --check` başarılı.
- **Kapsam dışı:** Gerçek PSP seçimi, sağlayıcı sandbox sözleşme testleri ve canlı para tahsilatı/iadesi yapılmayacaktır; ödeme davranışı mock adapter ile doğrulanır.

**Mock sandbox çıkış ölçütü (tamamlandı):** Yetkili, tutarı doğrulanmış mock ödeme sonucu sipariş durumuna bir kez yansır; başarısız veya süresi dolmuş sipariş stoku bir kez iade eder; hassas ödeme verisi uygulamaya hiç girmez. Gerçek PSP entegrasyonu kapsam dışıdır.

## REQ-012 — Sipariş takibi ve operasyonel yönetim

- **Öncelik:** P1
- **Durum:** İlk dilim tamamlandı: SQLite backend 244 test geçti (%96,89 coverage), PostgreSQL entegrasyon testleri 11/11, web 148 test (%100 coverage), Keycloak E2E 8/8 geçti; build/lint/Ruff başarılı.
- **Kullanıcı hikâyesi:** Alıcı olarak siparişimin güncel durumunu ve geçmişini görmek; admin olarak siparişleri izleyip güvenli biçimde operasyon durumunu ilerletmek ve uygun siparişleri iptal/iade kaydına almak istiyorum.
- **Alıcı görünümü:** Alıcı yalnızca kendi siparişlerini ve sistem/admin tarafından kaydedilen durum geçişlerini görür. Admin aktör kimliği alıcı yanıtında paylaşılmaz.
- **Operasyon durumları:** Ödeme başarısı `paid` durumuna geçirir; admin yalnızca sırayla `paid → processing → shipped → delivered` ilerletebilir. Taşıyıcı/kargo entegrasyonu yoktur; durumlar admin tarafından manuel güncellenir.
- **Ödeme bekleyen siparişler:** Mevcut REQ-011 davranışı değişmez; başarısız/iptal/zaman aşımında sipariş otomatik `cancelled` olur ve stok bir kez iade edilir. Buyer/admin tarafından ayrıca manuel iptal bu dilimde yoktur.
- **Ödenmiş siparişte iade:** Yalnızca `paid` veya `processing` aşamasında admin iptal/iade kaydı oluşturabilir. Sipariş `cancelled`, mock ödeme kaydı `refunded` olur; neden, admin subject'i ve zaman audit geçmişinde saklanır. Aynı işlem tekrarı ek stok veya audit olayı oluşturmaz. `shipped`/`delivered` siparişler bu işlemle iptal edilemez; ürün geri kabul/iade süreci ayrı gereksinimdir.
- **Mock ödeme sınırı:** `refunded` yalnızca uygulamadaki manuel test kaydıdır; PSP bağlı olmadığı için gerçek para transferi/iadesi yapılmaz.
- **Stok kararı:** İade/iptal ve stok geri yükleme tek transaction içindedir; ürün artık silinmişse (sipariş kaleminde `product_id` null) mevcut stok geri yüklenemez, sipariş snapshot'ı korunur.

### Kabul kriterleri

1. Alıcı sipariş geçmişinde güncel durumu ve zaman damgalı durum geçmişini görebilir; başka alıcının siparişini okuyamaz ve audit aktör subject'i görmez.
2. Sadece admin sipariş listesi/detayını ve actor dahil audit bilgisini görebilir; filtreleme ve sayfalama sınırları uygulanır.
3. Admin durum güncellemesi yalnızca `paid → processing → shipped → delivered` sırasındaki tek sonraki geçişe izin verir. Aynı hedef durumun tekrarı idempotenttir; geçersiz atlama/geri alma reddedilir.
4. Admin iadesi yalnızca `paid`/`processing` ve `succeeded` ödeme için mümkündür; gerekçe zorunludur. `pending_payment`, `shipped`, `delivered` veya ödeme başarıya ulaşmamış sipariş reddedilir.
5. Yerel iade tek DB transaction'ında siparişi `cancelled`, ödemeyi `refunded` yapar, ürün stoklarını en fazla bir kez geri yükler ve admin/gerekçe/zaman audit kaydını yazar. Başarısız işlemde hiçbir parça kalıcı olmaz.
6. İade işleminin tekrarı mevcut sonucu döndürür; stok ve audit kaydı ikinci kez değişmez. Kullanıcı/admin rol sınırı API'de zorunludur.
7. Admin arayüzü durum geçişlerini ve gerekçe girişini gösterir; mock iadenin gerçek para transferi olmadığı kullanıcıya açıkça belirtilir.

### API sözleşmesi ve test planı

- `GET /api/v1/admin/orders?status=&limit=&offset=` ve `GET /api/v1/admin/orders/{order_id}` — yalnızca admin; sipariş, ödeme durumu ve audit geçmişi.
- `PATCH /api/v1/admin/orders/{order_id}/status` — `{ "status": "processing" | "shipped" | "delivered" }`; yalnızca sıradaki geçiş.
- `POST /api/v1/admin/orders/{order_id}/refund` — `{ "reason": "..." }`; yerel iade, gerçek para hareketi yok.
- **Unit/API/DB:** Rol ve sahiplik, filtre/pagination, geçersiz/geçerli durum geçişleri, yeniden oynatma, ödeme durum doğrulaması, iade/stok atomikliği ve audit actor/gerekçe/zamanı.
- **Migration:** Sipariş/ödeme check constraint güncellemesi, mevcut siparişlerin başlangıç audit geçmişinin backfill'i ve downgrade.
- **Component:** Alıcı geçmişi ve admin listesi/durum/iade aksiyonları; hata/boş/loading ve mock iade açıklaması.
- **E2E:** Buyer siparişi oluşturur ve durum geçmişini görür; admin operasyon durumunu ilerletir/iade kaydı oluşturur; buyer'ın admin endpoint değişikliği `403` ile reddedilir.
- **Gerçek PSP/kargo:** Bu dilimde dış entegrasyon yok; sağlayıcı callback'i, para iadesi veya taşıyıcı olayları simüle edilmiyor.

**Çıkış ölçütü:** Her sipariş durumu değişikliği yetkili ve denetlenebilir; alıcı/admin görünümü tutarlı; iade ve stok etkisi transaction içinde, idempotent ve yalnızca mock kayıt olarak uygulanır.

**Mevcut doğrulama:** SQLite backend 244 geçti (%96,89 coverage); PostgreSQL entegrasyon/eşzamanlılık testleri 11/11 geçti. Web 148 geçti (%100 coverage), production build/Oxlint/Ruff ve `git diff --check` başarılı. Gerçek Keycloak E2E 8/8 geçti; sipariş checkout → mock ödeme → admin processing/iade → alıcı geçmişi senaryosu dahil.

## İleri gereksinim adayları

Gerçek ödeme/PSP, kargo/taşıyıcı ve KYC/KYB entegrasyonları öğrenme projesinin kapsamı dışındadır; iş akışları yerel/mock davranışlarla doğrulanır. Önerilen sonraki sıra:

1. **REQ-013 — Katalog arama, filtreleme ve sıralama:** Tamamlandı.
2. **REQ-014 — Teslimat sonrası yerel ürün iadesi:** Sipariş/kalem durum makinesi, gerekçeli karar, audit, stok ve idempotency kuralları için ayrı kabul kriterleri oluşturulacak; gerçek para iadesi yapılmayacak.
3. **REQ-015 — Adres ve teslimat seçeneği snapshot'ı:** Adres doğrulama, seçenek/ücret kuralları ve sipariş anı verisinin korunması test edilecek; gerçek kargo sağlayıcısı bağlanmayacak.
4. **QA-016 — API sözleşme/regresyon kapısı:** OpenAPI ve istemci beklentilerini CI'da karşılaştıran otomatik kontroller.
5. **QA-017 — Erişilebilirlik:** Tamamlandı; kritik buyer/admin akışlarında otomatik tarama, klavye sırası ve görünür odak testleri.
6. **QA-018 — PostgreSQL testlerinin CI'a eklenmesi:** Tamamlandı; PostgreSQL 17 migration ve entegrasyon testleri SQLite regresyonundan bağımsız çalışır.
7. **QA-019 — CI'da deterministik E2E:** PR'larda harici/koşullu Keycloak gerektirmeyen kritik kullanıcı akışları.
8. **QA-020 — Test sınıflandırması ve çalışma sıklığı (tamamlandı):** Pytest/Playwright etiketleri, PR smoke ve nightly/elle tetiklenen Keycloak E2E ayrımı, unified raporlama.
9. **QA-021 — Coverage kapsamının netleştirilmesi (tamamlandı):** Frontend coverage ölçümünü kritik UI akışlarıyla hizalama ve gerçek ölçülen dosyaları CI özetinde gösterme.
10. **QA-022 — API yanıt sözleşmesi doğrulaması (tamamlandı):** Temsilî API yanıtlarını sürümlü OpenAPI/JSON Schema'ya doğrulama ve istemci sözleşme kontrollerini CI kalite kapısında tutma.
11. **QA-023 — Tarayıcıda erişilebilirlik kapsamı (tamamlandı):** Giriş dışındaki kritik buyer/admin akışlarında Chromium axe WCAG 2.1 A/AA taramaları; kontrast ve mobil yatay taşma doğrulaması.
12. **QA-024 — E2E mimarisi ve standartlaştırma (tamamlandı):** Playwright fixture + API seed + tekrar eden login UI'ı için ince POM; deterministik E2E 4/4 ve gerçek Keycloak E2E 10/10 geçti.
13. **QA-025 — Bağımlılık güvenlik kapıları (tamamlandı):** Kilitli frontend/backend bağımlılıklarını CI'da tarama, raporlama ve severity kapısı uygulama.
14. **REQ-016 — Satıcı onayı ve marketplace yetkileri:** Manuel onayın uygulama içindeki anlamı, onaylı satıcıların ilan ve mock marketplace yetkileri ile rol sınırları netleştirilir; KYC/yasal uygunluk iddiası yoktur.
15. **REQ-017 — Marketplace satıcı sipariş operasyonları:** Satıcıya ait satışların ve manuel sipariş operasyonlarının güvenli yönetimi; satıcılar arası veri izolasyonu ve admin gözetimi.
16. **REQ-018 — Alıcının sipariş iptali:** Alıcının kendi uygun siparişini iptali; mock ödeme/iade, stok, transaction ve idempotency kuralları.
17. **QA-026 — Performans başlangıç çizgisi (en son):** Sınırlı yük profili, ölçülebilir eşikler ve tekrarlanabilir rapor.

REQ-013–015 ve QA-016–QA-025 tamamlanmıştır. REQ-016–REQ-018'in ayrıntılı kabul kriterleri ve test planları geliştirme öncesinde bu belgede tanımlanacak; QA-026 bu gereksinimlerden sonra başlatılacaktır.

Kapsam dışı: gerçek PSP/para transferi, KYC/KYB ve gerçek kargo sağlayıcısı. E-posta/parola yaşam döngüsü özellikleri bu yol haritasında yer almıyor.

## REQ-013 — Katalog arama, filtreleme ve sıralama

- **Öncelik:** P1 (QA odaklı sonraki dilim)
- **Durum:** Tamamlandı. Backend regresyonu 249 geçti (%96,94 coverage); ayrı PostgreSQL entegrasyonu 12/12; web 152 test, tüm coverage ölçümlerinde %100; gerçek Keycloak E2E 8/8 geçti. Build, Oxlint, Ruff ve format kontrolleri başarılı.
- **Kullanıcı hikâyesi:** Alıcı olarak ürün kataloğunda arama yapıp kategori ve fiyat aralığıyla sonuçları daraltmak, sonuçları sıralamak istiyorum.
- **Kapsam:** Mevcut korumalı katalog endpoint'i ve ana sayfa UI'ı; harici arama servisi veya yeni veritabanı altyapısı yoktur. Arama adı, kategori ve açıklama içinde kısmi/case-insensitive eşleşir; kategori eşleşmesi tam ve case-insensitive'dir.

### Kabul kriterleri

1. `GET /api/v1/products` isteği `search`, `category`, `min_price`, `max_price` ve `sort` filtrelerini; mevcut `limit`/`offset` ile birlikte kabul eder.
2. Arama metni trim edilir ve ad/kategori/açıklamada kısmi, büyük-küçük harf duyarsız aranır. Boş/yalnız boşluk arama filtresi uygulanmaz; `%` ve `_` gibi LIKE karakterleri literal aranır.
3. Kategori trim edilir ve tam, büyük-küçük harf duyarsız eşleştirilir. Fiyat alt/üst sınırları dahildir; yalnız bir sınır gönderilebilir.
4. `min_price > max_price`, tanımlı aralık dışı fiyat, aşırı uzun arama/kategori veya desteklenmeyen sıralama `422` döndürür; katalog değişmez.
5. `sort` seçenekleri `id` (varsayılan), `name`, `price_asc`, `price_desc` değerleridir. Eşit ad/fiyat durumları ürün kimliğiyle kararlı sıralanır.
6. `total`, pagination uygulanmadan önce filtrelenmiş sonuç sayısını verir; sonuç listesi yalnızca eşleşen ürünleri içerir.
7. Katalog filtreleri yalnızca UI'da değil backend sorgusunda uygulanır. Filtre gönderimi, boş sonuç, filtre hatası ve yeniden deneme anlaşılır ve erişilebilir UI durumlarıyla gösterilir.
8. Buyer/admin/seller'ın mevcut katalog görünürlüğü ve ürün yönetim yetkileri değişmez; filtre parametreleri yetki sınırını etkilemez.

### Test planı ve izlenebilirlik

- **Unit/API:** Arama alanları, trim/case davranışı, literal wildcard, kategori, dahil fiyat sınırları, tek taraflı aralık, sıralama ve tie-break; filtrelenmiş total/pagination; invalid parametre `422`.
- **DB/entegrasyon:** SQLAlchemy sorgusunun SQLite ve PostgreSQL'de aynı eşleşme/sıralama sonuçlarını verdiği doğrulanır; migration beklenmez.
- **Component/API client:** Filtre formu, query parametrelerinin doğru encode edilmesi, sonuç sayısı, boş sonuç ve ters fiyat aralığının gönderilmeden reddi.
- **E2E:** Gerçek Keycloak alıcısı, admin tarafından önceden eklenen farklı kategori/fiyatlarda ürünleri arar, filtreler ve sıralar; URL/API sonucu ve görünür ürünler tutarlıdır.
- **Regresyon:** Varsayılan katalog pagination'ı, admin/seller CRUD, buyer katalog görünümü ve sepet işlemleri korunur.

**Test katmanı izlenebilirliği:** API ve PostgreSQL sorgu davranışı `apps/api/tests/test_products.py` ve `apps/api/tests/test_cart_postgres.py`; API istemcisi/component/form/boş durum `apps/web/src/api.test.ts` ve `apps/web/src/App.test.tsx`; gerçek Keycloak arama ve boş sonuç `apps/web/e2e/cart.spec.ts` ile doğrulanır.

**Çıkış ölçütü:** Filtre ve sıralama backend'de doğru uygulanır, sayfalama/total tutarlıdır, geçersiz girdiler güvenli reddedilir ve otomatik API/component/E2E testleri geçer.

## REQ-014 — Teslimat sonrası yerel ürün iadesi

- **Öncelik:** P1 (QA odaklı sonraki dilim)
- **Durum:** Tamamlandı. Backend 259 geçti, 13 atlandı (%95,85 coverage); PostgreSQL 13/13, web 154 test (%100 coverage), Keycloak E2E 9/9; build/lint başarılı.
- **Kullanıcı hikâyesi:** Alıcı olarak kargoya verilmiş veya teslim edilmiş siparişimdeki bir ürünün bir kısmını ya da tamamını iade kaydına alıp kalan iade hakkımı görebilmek istiyorum.
- **Kararlar:** `shipped` ve `delivered` siparişler uygun. Başvuru penceresi son geçerli durum geçişinden itibaren 30 gündür: `delivered` için teslim olayı, halen `shipped` için kargo olayı başlangıçtır. Alıcı kalem başına kısmi miktar verebilir. Uygun talep otomatik onaylanır; admin inceleme aşaması yoktur. Bu bir yerel test kaydıdır, gerçek kargo/para transferi yapılmaz.
- **İade/ödeme/stok:** Her talep gerekçe, miktar, kalem snapshot fiyatı ve yerel iade tutarıyla saklanır. Aynı kalemin toplam iade miktarı satın alınan adedi aşamaz. Ödeme toplam iade tutarı 0'dan büyük ve sipariş tutarından küçükken `partially_refunded`, tamamına eşit olduğunda `refunded` olur. Onay ve ürün mevcutsa stok artışı tek transaction'da gerçekleşir; ürün silinmişse sipariş snapshot'ı/iade kaydı kalır fakat stok eklenmez.
- **Idempotency:** Buyer her istekte `Idempotency-Key` gönderir. Aynı kullanıcı/anahtar ve aynı payload önceki sonucu döndürür; anahtar farklı payload ile tekrar kullanılırsa `409` olur.

### Kabul kriterleri

1. Yalnızca buyer, sahibi olduğu sipariş için iade talebi açabilir; başka sahibin siparişi `404`, buyer olmayan/anonim istek sırasıyla `403`/`401` alır.
2. Sipariş `shipped` veya `delivered`, ödemesi `succeeded` ya da `partially_refunded` ve geçerli son durum olayı en fazla 30 gün önce olmalıdır. Sınır anı dahil; daha eski talep `409` ile reddedilir.
3. Talep kalem kimliği, pozitif miktar ve en az 5 karakterlik gerekçe alır. Kalem ilgili siparişe ait olmalı, silinmiş/başka sipariş kalemi olmamalı ve istenen miktar daha önce iade edilmeyen miktarı aşmamalıdır.
4. Geçerli talep otomatik `approved` durumuyla kaydedilir; iade tutarı sipariş kaleminin snapshot birim fiyatı × miktardır. Siparişin toplam durumu değişmez.
5. Yerel iade tutarları birikimli olarak ödeme kaydını `partially_refunded`/`refunded` durumuna geçirir; tam iade tutarı sipariş toplamını aşamaz.
6. İade kaydı, ödeme durumu/tutarı ve mevcut ürünün stok artışı tek transaction'da kalıcılaşır. Stok üst sınırı veya DB hatasında rollback olur, kısmi iade bırakılmaz.
7. Eşzamanlı talepler kalemin kalan miktarını aşamaz. Aynı idempotency isteği replay edildiğinde ikinci iade/stok/audit etkisi oluşmaz.
8. Buyer sipariş yanıtında iade taleplerini ve kalem bazında iade edilmiş/kalan miktarı görebilir; gerekçe, durum, tutar ve zaman gösterilir. Admin actor subject'i buyer yanıtında yer almaz.
9. Sipariş geçmişi/arayüzü uygun kalemlerde iade formunu, loading/error/başarı durumlarını ve bunun yerel mock işlem olduğuna dair açıklamayı sunar. Uygun olmayan kalem için eylem sunulmaz; API kuralı yine backend'de uygulanır.

### API sözleşmesi ve test planı

- `POST /api/v1/orders/{order_id}/returns` — `Idempotency-Key` başlığı ve `{ "order_item_id": 1, "quantity": 1, "reason": "..." }`.
- Buyer sipariş yanıtına `returns` listesi eklenir; her iade kaydında kalem, miktar, gerekçe, durum, tutar ve zaman; kalem response'unda `returned_quantity` ve `returnable_quantity` bulunur.
- **Unit/API:** Rol/sahiplik, shipped/delivered ve payment statüleri, 30 günlük exact boundary/expired/future-event, item ownership, invalid quantity/reason, repeated/over-quantity, idempotency aynı/farklı payload.
- **DB/transaction:** Bir veya birden fazla kalemde partial/full refund birikimi; stock, return, payment rollback; ürün silinmesi; concurrent same-item requests; migration upgrade/downgrade.
- **Component/API client:** Uygun kalemde form, miktar üst sınırı, gerekçe, başarıyla güncellenen kalan hak, tekrar yüklemede görünür geçmiş ve API/network hatası.
- **E2E:** Gerçek Keycloak buyer ve admin ile sipariş oluştur/öde; admin siparişi `shipped`/`delivered` yapar; buyer kısmi ve kalan iade talebi gönderir; payment ve stock etkileri API/DB ile doğrulanır.
- **Regresyon:** Admin'in mevcut kargoya verilmeden önce tam sipariş iptal/iade işlemi, checkout/ödeme/expiry, alıcı sipariş geçmişi ve rol sınırları korunur.

**Çıkış ölçütü:** Uygun alıcı kalem bazında kısmi/tam yerel iade talebini otomatik ve idempotent oluşturur; miktar/audit/ödeme/stok tutarlılığı SQLite, PostgreSQL, component ve gerçek Keycloak E2E testleriyle kanıtlanır. Gerçek para veya taşıyıcı entegrasyonu yoktur.

## REQ-015 — Adres defteri ve yerel teslimat seçenekleri

- **Öncelik:** P1
- **Durum:** Tamamlandı; SQLite, PostgreSQL, web component/API ve gerçek Keycloak E2E regresyonları doğrulandı.
- **Kullanıcı hikâyesi:** Alıcı olarak birden fazla teslimat adresimi saklayıp siparişim için adres ve teslimat hızı seçmek, sipariş oluşturulduktan sonra kullanılan bilgilerin değişmeden kalmasını istiyorum.
- **Adres defteri:** Buyer birden fazla adres ekleyebilir, listeleyebilir, düzenleyebilir ve silebilir; aynı anda en fazla bir varsayılan adres bulunur. Yeni kullanıcıya varsayılan adres atanmaz; kullanıcı adres eklemeden checkout yapamaz. Silinen/düzenlenen adres geçmiş sipariş snapshot'ını etkilemez.
- **Adres alanları:** Alıcı adı, telefon, il, ilçe ve açık adres zorunlu; adres başlığı (ör. Ev/İş) zorunlu; posta kodu isteğe bağlıdır. Türkiye içi adres kullanılır. Telefon normalize edilip Türkiye E.164 biçiminde (`+90` ve 10 hane) doğrulanır. Metinler normalize edilir ve kontrol karakterleri reddedilir.
- **Teslimat:** `standard` 49,90 TL ve `express` 89,90 TL seçenekleri vardır. Ürün ara toplamı 1.000,00 TL veya üzerindeyse yalnız `standard` ücreti sıfırlanır; `express` ücretli kalır. Gerçek taşıyıcı/üretim adres doğrulama servisi yoktur.
- **Tutar/iade:** Sipariş toplamı ürün ara toplamı + teslimat ücretidir ve ödeme bu toplamdan başlatılır. Ürün iadeleri ürün satırı tutarıyla sınırlıdır; teslimat ücreti iade edilmez. Ürünlerin tamamı iade edilse de teslimat bedeli tahsil edilmişse ödeme `partially_refunded` kalır.
- **Snapshot:** Sipariş, seçilen adresin alanlarını, teslimat yöntemini, teslimat ücretini ve sipariş anındaki toplamı saklar. Adres sonradan güncellense/silinse de sipariş geçmişi değişmez. Önceki siparişlerde adres/yöntem yoksa alanlar `null`, teslimat ücreti `0.00` olarak sunulur.

### Kabul kriterleri

1. Buyer yalnız kendi adreslerini listeleyebilir, oluşturabilir, güncelleyebilir ve silebilir; başka kullanıcı adresi erişimi `404`, buyer olmayan/anonim istek `403`/`401` olur.
2. Adres alanları normalize/doğrulanır; bozuk telefon, boş/uygunsuz alan, posta kodu biçimi `422` ile reddedilir.
3. Bir kullanıcı birden fazla adres saklayabilir; varsayılan adres işaretleme başka varsayılanı kaldırır. Varsayılan adres silinince otomatik başka adres varsayılan yapılmaz.
4. Checkout için kullanıcıya ait geçerli adres ve desteklenen teslimat yöntemi zorunludur. Eksik/sahip olunmayan adres ve geçersiz yöntem için sipariş, stok veya ödeme oluşturulmaz.
5. Standart teslimat ürün ara toplamı 1.000,00 TL altındaysa 49,90 TL, eşik ve üzerinde ücretsizdir. Hızlı teslimat her durumda 89,90 TL'dir. Eşik kuruş duyarlılığında inclusive hesaplanır.
6. Sipariş `total_amount` değeri ürün ara toplamı + teslimat ücretidir; ödeme miktarı aynı toplamdır.
7. Sipariş yanıtı buyer ve admin için snapshot adresini, yöntemi, ücretini ve ürün ara toplamını gösterir. Adres kaydı düzenlenip/silinince snapshot değişmez.
8. Aynı idempotency anahtarı ile checkout tekrarı ikinci sipariş veya stok/ödeme etkisi üretmez; yanıt önceki snapshot'ı verir.
9. Ürün iadeleri ürün kalem tutarını geri öder, teslimat ücretini ödemez; tüm ürün miktarları iade edilse bile kalan teslimat bedeli nedeniyle ödeme durumu `partially_refunded` olur.

### API sözleşmesi ve test planı

- `GET/POST /api/v1/addresses`, `PUT/DELETE /api/v1/addresses/{address_id}` buyer adres defteri; varsayılan durumu create/update gövdesinde belirtilir.
- `POST /api/v1/orders` checkout gövdesi `address_id` ve `delivery_method` alır. Sipariş yanıtında `item_subtotal`, adres snapshot'ı, `delivery_method` ve `delivery_fee` bulunur.
- **Unit/API:** Adres sahibi/rol, CRUD, default uniqueness, normalizasyon, telefon/posta kodu/uzunluk sınırları; checkout adres/method sahipliği; ücret eşik sınırı, ödeme toplamı, idempotency ve snapshot.
- **DB/transaction/migration:** Address CRUD ve partial unique default index SQLite/PostgreSQL; sipariş snapshot kolonları, eski siparişlerin null/0 uyumluluğu; checkout stok, sepet ve sipariş snapshot'ını tek transaction'da değiştirir. Ödeme ayrı işlemde sipariş toplamından oluşturulur.
- **Component/API client:** Adres ekle/düzenle/sil/default, boş/yükleme/hata durumları; sepetten teslimat adresi/yöntemi seçimi, eşik ve ara toplam/teslimat/genel toplam gösterimi.
- **E2E:** Gerçek Keycloak alıcısı adres kaydeder, ürün ara toplamını eşik altı/eşik üstü farklı teslimat seçenekleriyle sipariş eder; ödeme/toplam/snapshot doğrular; adresi değiştirip silerek geçmiş snapshot'ın sabit kaldığını görür.
- **Regresyon:** REQ-009/010/011/012/014 sepet, ödeme, iade ve admin akışları; mevcut siparişlerin migration/API uyumluluğu.

**Çıkış ölçütü:** Yetki ve doğrulaması test edilmiş adres defteri ile sabit ücretli yerel teslimat seçenekleri checkout, ödeme ve tarihsel sipariş snapshot'ında tutarlı çalışır; SQLite, PostgreSQL, UI, E2E ve regresyon testleri geçer.

**Test katmanı izlenebilirliği:** `apps/api/tests/test_addresses.py` adres doğrulama/sahiplik, kuruş hassasiyetinde ücret sınırları, checkout ve snapshot davranışını; `apps/api/tests/test_order_migration.py` migration upgrade/downgrade'ını; `apps/api/tests/test_cart_postgres.py` PostgreSQL kısıtı ve snapshot/ödeme toplamını; `apps/api/tests/test_product_returns.py` teslimat bedeli hariç ürün iadesini doğrular. `apps/web/src/AddressBookPanel.test.tsx`, `apps/web/src/CartPanel.test.tsx`, `apps/web/src/App.test.tsx` ve `apps/web/src/api.test.ts` adres, checkout ve istemci davranışlarını kapsar. `apps/web/e2e/cart.spec.ts` gerçek Keycloak ile eşik altı Standart, eşikte Hızlı teslimat, ödeme ve adres değişikliği/silme sonrası snapshot'ı doğrular.

## QA-016 — API sözleşme ve regresyon otomasyonu

- **Durum:** Tamamlandı. Tüm değiştirilen smoke ve `@keycloak` E2E senaryoları ilgili kiplerinde geçti.
- **Amaç:** Backend OpenAPI değişikliklerinin ve tanımlanmış frontend API istemcisi uyumsuzluklarının servis başlatmadan yerelde ve CI'da fark edilmesi.

### Kabul kriterleri

1. FastAPI'den deterministik üretilen OpenAPI belgesi sürümlenir; eksik veya güncel olmayan snapshot kontrolü başarısız olur ve güncelleme komutunu gösterir.
2. Sürümlü belgeden üretilen TypeScript modellerinin güncelliği kontrol edilir. Frontend istek tipleri şemaya; şema yanıt tipleri istemcinin beklediği tiplere strict null kontrolüyle atanabilir olmalıdır.
3. Mevcut frontend istemci çağrıları için yol, HTTP yöntemi, zorunlu gövde/başlık, bearer kimlik doğrulaması ve kullanılan sorgu parametreleri OpenAPI ile karşılaştırılır. Bilinmeyen yol/yöntem ve eksik idempotency başlığı reddedilir.
4. Snapshot ve istemci kontrolleri CI backend/frontend işlerinde zorunludur. Kasıtlı değişikliklerde güncelleme adımları dokümante edilir.

### Test izlenebilirliği ve sınırlar

- `apps/api/tests/test_openapi_contract.py`: deterministik çıktı, güncel/eksik snapshot, yol/başlık/yanıt değişikliği.
- `apps/web/src/api.contract.ts`: istek ve yanıt model eşlemeleri ile negatif tip kontrolleri; `apps/web/src/api.openapi.test.ts`: mevcut 29 istemci çağrısı ve negatif yol/yöntem/başlık kontrolleri.
- `apps/web/scripts/openapi-contract.mjs`: üretilen model dosyalarını yeniden üretip karşılaştırır; CI komutları `.github/workflows/ci.yml` içindedir.
- Model eşlemeleri ve çağrı listesi elle güncellenir; yeni fonksiyonları otomatik keşfetmez. Bu kontroller, gövde değerlerini veya canlı API yanıtlarını JSON Schema'ya karşı doğrulamaz, tüm backend endpoint'lerini tüketmez ve var olan API/E2E testlerinin yerine geçmez.

## QA-017 — Erişilebilirlik otomasyonu

- **Durum:** Tamamlandı.
- **Amaç:** Kritik alışveriş ve yönetim akışlarında otomatik erişilebilirlik bulgularını, klavye ile erişilebilirliği ve odak davranışını regresyon testlerine bağlamak.

### Kabul kriterleri

1. Kritik buyer/admin arayüz durumları axe-core ile WCAG 2.1 A/AA kurallarına göre taranır; ihlaller testleri başarısız kılar.
2. Gerçek Chromium taramasında giriş ekranındaki WCAG 2.1 A/AA erişilebilirlik ihlalleri sıfırdır.
3. Giriş ekranı ve kritik form/checkout kontrolleri klavyeyle DOM sırasına uygun gezilebilir; erişilebilir etkileşim açılışında odak tetikleyicide kalır ve tarayıcıda görünür odak göstergesi doğrulanır.
4. Erişilebilirlik testleri mevcut Vitest/Playwright CI aşamalarında çalışır; kapsam ve otomatik testlerin sınırları belgelenir.

### Test izlenebilirliği ve sınırlar

- `apps/web/src/accessibility.test.tsx`: ürün formu, adres defteri, sepet/checkout, buyer sipariş geçmişi ve admin sipariş yönetimi için axe taramaları; ürün/adres/checkout klavye sırası ve sipariş geçmişi tetikleyici odağı.
- `apps/web/e2e/accessibility.spec.ts`: Chromium'da giriş ekranı axe WCAG 2.1 A/AA taraması; Tab gezinmesi ve görünür odak halkası.
- Tarama, giriş ekranında **13 düşük kontrastlı metin öğesi** buldu; `apps/web/src/App.css` renkleri WCAG AA eşiğini sağlayacak şekilde düzeltildi ve tarama sıfır ihlalle geçti.
- JSDOM taramaları renk kontrastı, responsive reflow ve görsel düzeni değerlendiremez. Tarayıcı axe taraması şimdilik giriş ekranıyla sınırlıdır; ekran okuyucu ve manuel erişilebilirlik denetimi otomatikleştirilmiş değildir.

## QA-018 — PostgreSQL testlerinin CI'a eklenmesi

- **Durum:** Tamamlandı.
- **Amaç:** SQLite üzerinde hızlı çalışan backend regresyonunu korurken PostgreSQL'e özgü migration, transaction, constraint ve concurrency davranışlarını her CI koşusunda gerçek PostgreSQL servisi üzerinde doğrulamak.

### Kabul kriterleri

1. SQLite backend regresyonu değişmeden kendi CI işinde çalışır; PostgreSQL testleri ondan bağımsız ayrı iş/rapordur.
2. PostgreSQL CI servisi sürümlü (17), ephemeral ve yalnız entegrasyon testi için ayrılmıştır. Test bağlantısı yalnız adı `_test` ile biten `shop_test` veritabanını hedefler; geliştirme/kalıcı veritabanı kullanılmaz.
3. Migration'lar test veritabanına uygulanır; PostgreSQL işaretli testler boş veritabanında geçer. Bağlantı, migration veya test hatası PostgreSQL işini ve aggregate workflow'u başarısız kılar.
4. PostgreSQL JUnit sonuçları artefakt olarak saklanır ve birleşik CI raporunda bağımsız aşama/test sayısı olarak görünür.

### Test izlenebilirliği

- `.github/workflows/ci.yml`: PostgreSQL 17 service health check, `shop_test`, bağımsız `postgres` job, migration/integration test komutu ve JUnit artefaktı.
- `apps/api/tests/test_cart_postgres.py`: PostgreSQL ürün filtreleme, cart constraint/stock/concurrency, checkout yarışları ve idempotency, webhook/refund/return/expiry, adres-default ve sipariş snapshot/ödeme toplamı.
- `apps/api/tests/test_cart_postgres.py::postgres_engine`: URL'in PostgreSQL backend'i ve `_test` suffix'i için koruma; test başına yalnız uygulama tabloları truncate edilir.
- `scripts/ci-summary.mjs`: PostgreSQL raporunu diğer SQLite/backend, frontend ve browser aşamalarından ayrı gösterir; `report` işi PostgreSQL başarısızlığı ya da rapor eksikliğinde workflow'u başarısız yapar.

## QA-019 — CI'da deterministik E2E

- **Durum:** Tamamlandı.
- **Amaç:** Kritik browser akışlarının PR CI'da yerel Keycloak, dış servis, geliştirici hesabı veya koşullu ortam hazırlığı gerektirmeden gerçek API ve izole veritabanı üzerinde tekrarlanabilir biçimde çalışması.

### Kabul kriterleri

1. Varsayılan Playwright/CI koşusu yerel, yalnız test amaçlı OIDC JWKS sağlayıcısı ve her koşuda üretilen geçici RSA anahtarı kullanır; Keycloak'a veya test parolasına ihtiyaç duymaz.
2. E2E API'si yalnız yeni oluşturulan geçici SQLite veritabanına bağlanır. Üretim veya geliştirici veritabanı, kalıcı Keycloak realm'i ve harici servis kullanılmaz.
3. En az bir kritik buyer senaryosu gerçek Chromium, web istemcisi ve API üzerinden ürün görüntüleme, sepet, adres/checkout ve mock ödeme tamamlanmasını doğrular. Buyer'ın admin ürün oluşturma girişimi `403` alır.
4. Gerçek Keycloak kayıt/giriş/rol E2E'leri korunur ve yalnızca açıkça `E2E_KEYCLOAK_E2E=1` ile çalıştırılır; deterministik test sağlayıcısıyla karıştırılmaz.
5. Playwright raporları/başarısızlık izleri CI'da yayımlanır; E2E başarısızlığı unified raporu ve workflow'u başarısız kılar.

### Test izlenebilirliği ve sınırlar

- `apps/web/e2e/qa-019-deterministic.spec.ts`: Chromium'da admin tarafından test ürünü kurulumu, buyer katalog/sepet/adres/checkout/mock ödeme akışı ve buyer admin-yetkili ürün oluşturma reddi.
- `apps/web/e2e/deterministicAuth.ts`: OIDC session'ı test tarayıcısına kurar ve ephemeral anahtarla issuer/audience/rol claim'leri doğrulanabilir erişim token'ı imzalar.
- `apps/web/e2e/start-test-identity.mjs`: yalnız public test anahtarını JWKS olarak sunar; `apps/web/playwright.config.ts` varsayılan E2E'de bunu API'ye ve Vite istemcisine bağlar.
- Gerçek Keycloak testleri ayrıca kayıt/giriş sayfalarını ve realm rol işlemlerini doğrular; deterministik test sağlayıcısı Keycloak'ın protokol/arayüz uygunluk testi değildir ve gerçek kullanıcı parolası işlemez.

## QA-020 — Test sınıflandırması ve çalışma sıklığı

- **Durum:** Tamamlandı.
- **Amaç:** Hızlı PR geri bildirimi ve kapsamlı, daha yavaş servis/browser testlerini ayrı tetikleyip görünür raporlamak.

### Kategori sözlüğü ve politika

| Etiket | Kapsam | Çalışma sıklığı |
|---|---|---|
| `smoke` | Hızlı, kritik davranış/alışveriş yolu | Her PR; yerelde seçilebilir |
| `regression` | Olağan backend/frontend regresyonu | Her PR; Pytest kategorisi belirtilmeyen testlere varsayılan |
| `integration` | Uygulama ile DB/altyapı sınırları | Her PR; PostgreSQL ayrı job |
| `e2e` | Browser üzerinden tam kullanıcı yolu | Smoke E2E her PR; kapsamlı paket ayrıca |
| `security` | Kimlik doğrulama, yetkilendirme ve güvenlik kuralları | Her PR'da ilgili regression; ileride kapsamlı taramalar ayrıca |
| `keycloak` | Gerçek Keycloak realm/OIDC/rol entegrasyonu | Nightly (02:00 UTC) ve elle `workflow_dispatch`; PR'da çalışmaz |
| `performance` | Yük/performans ölçümleri | QA-026'da tanımlanacak; PR kapısı değildir |

Kategoriler örtüşebilir. PostgreSQL testleri `integration` ve `postgres`; Playwright smoke senaryosu hem `e2e` hem `@smoke`'tır. Pytest'te strict marker kontrolü açıktır; `smoke`, `integration`, `security`, `keycloak` veya `performance` almamış yeni testler otomatik `regression` sınıfına girer.

### Kabul kriterleri

1. Pytest marker sözlüğü strict-marker denetimiyle tanımlıdır; `pytest -m smoke` seçimi smoke testlerini, varsayılan tam koşu regresyonları içerir.
2. Vitest smoke testi `@smoke` ad etiketiyle `npm run test:smoke` üzerinden seçilebilir; tam `npm test`/coverage koşusu PR regression kapısıdır.
3. Playwright `@smoke` ve `@keycloak` etiketleri ayrı npm komutlarıyla seçilir; runner komut argümanlarını Playwright'a geçirir.
4. Her push/PR'da backend, PostgreSQL, frontend regression ve browser smoke testleri zorunludur. `@keycloak` testleri ephemeral realm'de yalnız nightly/elle çalışır.
5. Nightly/manual Keycloak job'ı realm import/readiness, geçici admin ve seller role-provisioner ayarını yapar; gerçek hesap veya kalıcı secret kullanmaz.
6. Unified rapor kategorileri ayrı gösterir. PR'da Keycloak job'ı optional/skipped; nightly/manual koşusunda required'dır. Required job/report hatası workflow'u başarısız kılar.
7. Test kategorileri, yerel komutlar ve yeni test ekleme kuralları bu dokümanda ve README'lerde açıklanır.

### Test izlenebilirliği ve sınırlar

- `apps/api/pyproject.toml`, `apps/api/tests/conftest.py`: Pytest strict marker sözlüğü, varsayılan regression etiketi ve PostgreSQL → integration eşlemesi.
- `apps/api/tests/test_auth.py`, `apps/api/tests/test_home.py`, `apps/api/tests/test_security.py`: smoke ve security test örnekleri.
- `apps/web/package.json`, `apps/web/src/App.test.tsx`: Vitest `@smoke` seçimi; diğer component/API testleri tam PR regresyon paketinde.
- `apps/web/e2e/*.spec.ts`, `apps/web/playwright.config.ts`, `apps/web/e2e/run-playwright.mjs`: Playwright `@smoke`/`@keycloak` seçimi ve izole çalıştırma.
- `.github/workflows/ci.yml`: PR smoke/regression kapıları, 02:00 UTC schedule, manuel tam koşu ve ephemeral Keycloak servisi.
- `apps/web/e2e/configure-ci-keycloak.mjs`: yalnız geçici realm için service-account yetkisi/credential hazırlığı; secret loglanmaz, CI maskesine alınır.
- `scripts/ci-summary.mjs`: PR'da opsiyonel, nightly/manual'da zorunlu Keycloak durumunu ve ayrı JUnit sayımını raporlar.
- Gerçek GitHub Actions runner'ındaki Keycloak image/realm import davranışı ilk nightly/manual çalışmada doğrulanmalıdır. Zamanlanmış GitHub Actions koşusu varsayılan branch üzerinde çalışır.

## QA-021 — Coverage kapsamının netleştirilmesi

- **Durum:** Tamamlandı.
- **Amaç:** Frontend coverage yüzdesinin kritik akış bileşenlerini kapsaması ve ölçüm sınırının CI ve yerel raporlarda açık olması.

### Kabul kriterleri

1. Vitest coverage `src/App.tsx`, `src/api.ts`, `src/auth.ts`, `src/ProductCreatePage.tsx` ve `src/*Panel.tsx` dosyalarını ölçer; yeni eşleşen paneller de dahil edilir. Giriş noktası, test/contract dosyaları, üretilen kod ve CSS ölçüm kapsamı dışında kalır.
2. Toplam coverage için statement %93, branch %88, function %95 ve line %93 alt sınırları zorunludur. Ölçülen her dosya için aynı sırayla %81, %70, %88 ve %83 alt sınırları uygulanır. Eski üç dosyanın (`App.tsx`, `api.ts`, `ProductCreatePage.tsx`) toplu %100 sınırı dört ölçümde de korunur.
3. Birleşik CI özeti ölçülen dosyaları coverage JSON raporundan listeler; rapor, toplam veya dosya listesi eksikse zorunlu kalite kapısı başarısız olur. HTML raporu dosya ve satır ayrıntılarını sağlar.
4. Satıcı başvuru yönetimi için yükleme hatası/yeniden deneme, zorunlu notla düzenleme isteği ve başarısız onayın yeniden denenmesi component testlerinde doğrulanır. Vitest regresyonları PR'da çalışmaya devam eder.
5. Kapsam ve eşikler README'lerde açıklanır. Coverage yüzdesi yalnız ölçülen dosyalarda çalıştırılan kodu ifade eder; doğruluk, tüm frontend kapsamı veya E2E kapsamı olarak sunulmaz.

### Test izlenebilirliği ve doğrulama

- `apps/web/vite.config.ts`: ölçüm kapsamı, toplam/dosya ve önceki üç dosya eşikleri.
- `apps/web/src/AdminSellerApplicationsPanel.test.tsx`: hata, yeniden deneme ve karar akışı; API çağrıları mock'lanır.
- `scripts/ci-summary.mjs`, `scripts/ci-summary.test.mjs`: JSON'dan gerçek dosya listesi, eksik kapsam hatası ve Keycloak raporlama regresyonu.
- `npm run test:coverage`: 212 test geçti; toplam statement %93,14, branch %88,50, function %95,60 ve line %93,75. Eksik kapsamlı bir test çalışmasında eski %100 ve yeni eşiklerin başarısız olduğu ayrıca doğrulandı.
- `npm run build`, `npm run lint` ve `node --test scripts/ci-summary.test.mjs` başarılı. Gerçek GitHub Actions koşusunun rapor artefaktı sunucu ortamında ayrıca gözlemlenmelidir.

## QA-022 — API yanıt sözleşmesi doğrulaması

- **Durum:** Tamamlandı.
- **Amaç:** Gerçek backend yanıt örneklerinin sürümlü OpenAPI response şemalarından sapmasını ve frontend çağrılarının sözleşmede tanımsız kalmasını CI'da yakalamak.

### Kabul kriterleri

1. Temsilî başarılı yanıtlar FastAPI `TestClient` üzerinden üretilir ve `docs/openapi.json` snapshot'ındaki ilgili operation/status/content JSON Schema'sına doğrulanır. Test, uygulamanın güncel OpenAPI çıktısını değil sürümlü snapshot'ı kullanır.
2. Doğrulama yerel `$ref`'leri, dinamik path parametrelerini, required alanları, türleri, nullable alanları ve JSON Schema formatlarını destekler; yanıtın HTTP durumu ve JSON content-type'ı operation tanımıyla eşleşir.
3. En az auth/current user, home, products, addresses, cart, order, payment, admin order ve seller application yanıt biçimleri kapsanır; boş/nullable seller başvurusu da doğrulanır. Eksik required alanı olan yanıtın reddedildiği negatif test bulunur.
4. `apps/web/src/api.openapi.test.ts` tüm istemci çağrılarının path/method ve gerekli auth/header/query/body koşullarını snapshot'a göre denetler; `npm run contract:check` üretilen istemci modellerini snapshot ile karşılaştırır.
5. Backend response-schema testleri varsayılan pytest/PR kapısında çalışır; istemci sözleşme kontrolü frontend PR kalite kapısında kalır. Validator yalnız test bağımlılığıdır.

### Test izlenebilirliği ve doğrulama

- `apps/api/tests/test_response_contract.py`: gerçek SQLite/TestClient yanıtlarını sürümlü response şemalarına doğrulama ve eksik alan negatif testi.
- `apps/api/tests/test_openapi_contract.py`, `apps/api/scripts/openapi_contract.py`: backend OpenAPI snapshot üretim/deterministik kontrolü.
- `apps/api/pyproject.toml`, `apps/api/uv.lock`: test grubu için `jsonschema` validator bağımlılığı.
- `apps/web/src/api.openapi.test.ts`, `apps/web/scripts/openapi-contract.mjs`: frontend çağrı biçimi ve generated model denetimi.
- `.github/workflows/ci.yml`: backend pytest ve frontend `contract:check` PR kalite kapıları.
- **Doğrulama:** `uv run pytest tests/test_response_contract.py tests/test_openapi_contract.py -q` 8 test geçti; `npm run contract:check` ve Ruff kontrolü başarılı.

## QA-023 — Tarayıcıda erişilebilirlik kapsamı

- **Durum:** Tamamlandı.
- **Amaç:** JSDOM'un gerçek renk/yerleşim davranışını ölçemediği durumları Chromium'da kritik dolu buyer/admin akışları üzerinden test etmek.

### Kabul kriterleri

1. İzole PR E2E ortamında WCAG 2.1 A/AA axe taramaları gerçek Chromium'da buyer katalog/mağaza, adres defteri, sepet/checkout ve sipariş geçmişini; admin sipariş yönetimi ve satıcı başvuruları ekranlarını kapsar.
2. Tarama, WCAG tag setindeki renk kontrastı dahil ihlalleri rapor ayrıntılarıyla başarısız kılar; gerçek tarama dışlanmaz veya kural kapatılmaz.
3. Buyer ve admin kritik görünümleri 320px genişlikte taranır ve sayfada yatay taşma olmadığı ölçülür. Görsel düzen doğrulaması burada reflow/overflow kontrolü ile sınırlıdır.
4. Yeni tarama deterministik `@smoke` E2E grubunda her PR'da, geçici API/SQLite/JWKS ortamında çalışır; gerçek Keycloak veya kalıcı kullanıcı gerektirmez.
5. Bulunan görsel kusurlar gerekli en küçük stil/viewport değişikliğiyle giderilir; test ve sınırlar README/roadmap'de belirtilir.

### Test izlenebilirliği ve doğrulama

- `apps/web/e2e/accessibility.spec.ts`: anonim giriş taraması ve klavye odağı yanında QA-023 buyer/admin akışlarının axe ve 320px yatay taşma kontrolleri.
- `apps/web/src/App.css`: ürün tablosu başlık, kategori, açıklama ve sipariş zamanı metinleri için kontrast iyileştirmeleri.
- `apps/web/src/index.css`: 320px ekranlarda yatay sayfa taşmasını engelleyen minimum gövde genişliği.
- `.github/workflows/ci.yml`, `apps/web/e2e/run-playwright.mjs`: mevcut PR browser `@smoke` işi test-only JWKS ile genişletilmiş erişilebilirlik senaryosunu çalıştırır.
- **Doğrulama:** `npm run test:e2e:smoke` başarıyla tamamlandı; QA-023 testi buyer/admin dolu ekranlarında axe ve mobil reflow kapılarını geçti. `npm run build` ve `npm run lint` başarılı.
- **Sınırlar:** Otomatik axe ve dar viewport kontrolü manuel ekran okuyucu testi, yakınlaştırma/reflow farklı seviyeleri ve diğer browser/cihaz kombinasyonlarını kapsamaz.

## QA-024 — E2E mimarisi ve standartlaştırma

- **Durum:** Tamamlandı.
- **Amaç:** Playwright testlerinde API hazırlığı, ortak fixture ve ince UI nesnelerini kullanırken doğrulanan kullanıcı davranışını browser üzerinden tutmak; senaryoya özgü adımları yapay katmanlara taşımamak.

### Kabul kriterleri

1. Playwright ortak scenario fixture'ı test başına, repeat/retry ve worker'ı da hesaba katan benzersiz kimlik üretir; aynı kimlik rol token'ı, browser authentication ve API seed işlemleri için kullanılır.
2. Ürün, adres, sepet ve sipariş hazırlığı gerçek test API'sine gider. Seed çağrısı beklenen HTTP durum kodunu sağlamazsa hata açık response body ile fail olur; testler uygulama DB'sine doğrudan yazmaz.
3. QA-019 checkout senaryosu ve QA-023 erişilebilirlik senaryosu ortak fixture kullanır. UI doğrulaması—adres formu, sepet, sipariş oluşturma/ödeme ve buyer/admin ekranları—browser üzerinden devam eder; API seed yalnızca ön koşulları kurar.
4. Tekrarlanan Keycloak hosted login adımları ince `KeycloakLoginPage` içinde paylaşılır. CRUD, erişim, sepet, kayıt ve satıcı başvurusu senaryolarının business-flow adımları spec'lerde kalır; ortak Composer/Journey katmanı eklenmez.
5. `@smoke` ve `@keycloak` sınıflandırması korunur. Her Playwright koşusu geçici SQLite ve deterministik kipte ephemeral JWKS'i temizler; Keycloak testleri oluşturdukları geçici hesapları teardown/`afterEach` cleanup'ında kaldırır.
6. Smoke E2E, değiştirilen tüm `@keycloak` E2E senaryoları, frontend lint ve build başarılıdır. Keycloak test yürütmesi yalnızca realm, test admin parolası ve seller akışı için service-account ayarı yapılandırılmış ortamda çalıştırılır; yalnızca test keşfi başarılı sayılmaz.

### Test izlenebilirliği ve doğrulama

- `apps/web/e2e/fixtures.ts`: retry/worker kapsamlı scenario ID, API seed helper'ları ve ortak auth fixture'ı.
- `apps/web/e2e/qa-019-deterministic.spec.ts`, `apps/web/e2e/accessibility.spec.ts`: fixture ile seed edilen önkoşullardan sonra browser'da devam eden smoke senaryoları.
- `apps/web/e2e/keycloakLoginPage.ts`: Keycloak login formu ve auth response beklemesi için ince POM; `admin-access.spec.ts`, `admin-crud.spec.ts`, `cart.spec.ts`, `login.spec.ts`, `seller-applications.spec.ts` kullanır.
- `apps/web/e2e/run-playwright.mjs`, `apps/web/e2e/start-api.mjs`: geçici DB, ephemeral identity key ve kaynak cleanup'ı; Keycloak senaryolarında hesap temizliği ilgili spec'lerde kalır.
- **Doğrulama:** Deterministik kipte `npm run test:e2e` 4/4 geçti; gerçek realm kipinde `E2E_KEYCLOAK_E2E=1 npm run test:e2e:keycloak` 10/10 geçti. Keycloak kipindeki iki cart senaryosunun ortak login POM değişikliği sırasında eksik fixture örneği hatası test koşusunda yakalanıp düzeltildi ve tam suite yeniden çalıştırılarak geçti. `npm run lint` ve `npm run build` başarılı.

## QA-025 — Bağımlılık güvenlik kapıları

- **Öncelik:** QA-024 sonrasındaki sıradaki QA geliştirmesi.
- **Durum:** Tamamlandı.
- **Amaç:** Kilitli frontend ve backend bağımlılıklarını CI'da her push/PR'da bilinen güvenlik advisory'lerine karşı taramak; bulguları anlaşılır biçimde raporlamak ve belirlenmiş eşiklerde kalite kapısını başarısız kılmak.

### Kabul kriterleri

1. Frontend taraması committed `apps/web/package-lock.json` ağacında `npm audit` ile çalışır. Düşük ve üzeri tüm severity seviyeleri başarısız olur.
2. Backend'de `uv export --locked` runtime ve varsayılan `dev` grubunu dahil ederek hash'li, tam kilitli paket listesini üretir. `pip-audit` sürümü sabitlenmiştir ve bu listede `--require-hashes --disable-pip` ile yeni sürüm çözmeden tarar.
3. Bilinen advisory bulgusu, npm audit eşiği, lockfile/export hatası, scanner hatası veya advisory servisine erişim hatası CI job'ını başarısız kılar. Bildirilen Python bulgularından herhangi biri kapıyı başarısız kılar. Genel/kalıcı ignore listesi ve otomatik dependency düzeltmesi yoktur.
4. npm audit okunabilir stdout raporu; pip-audit tablo raporu üretir. Her iki rapor mevcut frontend/backend rapor artefaktlarıyla birlikte, job başarısız olsa bile yüklenir ve CI'da 14 gün saklanır.
5. Güvenlik taraması frontend ve backend install adımları başarılı olduğunda her push/PR'da çalışır. Mevcut local taramada bulunan pytest advisory'si güvenli pytest sürümüne yükseltilir; lockfile güncellenir.
6. Kabul: temiz tarama başarılı; en az bir bilinen advisory taramayı non-zero ile durdurur; backend pytest, frontend lint/build ve CI workflow doğrulaması geçer.

### Uygulama ve izlenebilirlik

- `.github/workflows/ci.yml`: frontend `npm audit --audit-level=low`; backend locked uv export + sabitlenmiş `pip-audit==2.10.1`; raporlar mevcut 14 günlük artefaktlara eklenir.
- `apps/api/pyproject.toml`, `apps/api/uv.lock`: `pytest` güvenlik bulgusunu gidermek için pytest en az `9.0.3` olacak şekilde kilit güncellendi.
- **Yerel tarama bulgusu:** npm audit 0 advisory buldu. Backend scan `pytest 8.4.2` için `PYSEC-2026-1845` bildirdi ve non-zero çıktı; pytest 9.2.0'a yükseltildikten sonra aynı hash-lock taraması temiz geçti.
- **Doğrulama:** npm audit 0 advisory buldu. Python locked scan pytest 9.2.0 dahil temiz geçti. Geçici `pytest==8.4.2` dependency probu `PYSEC-2026-1845` nedeniyle exit code 1 ile kapıyı durdurdu. `uv run --locked pytest`: 289 geçti, 14 PostgreSQL testi beklenen şekilde atlandı. Ruff lint/format, frontend lint/build ve YAML parse kontrolü geçti.

## REQ-016 — Satıcı onayı ve marketplace yetkileri

- **Öncelik:** P1
- **Durum:** Tamamlandı. Bu dilimin temel akışı REQ-007 ve ürün yetkilendirmesinde mevcut olduğundan, onay/rol/başvuru durumu sınırları ek regresyon testleriyle açıkça güvenceye alındı.
- **Kullanıcı hikâyesi:** Satıcı olarak yalnızca admin başvurumu onaylayıp Keycloak `seller` rolünü başarıyla doğruladıktan sonra ürün yayımlamak ve kendi ürünlerimi yönetmek istiyorum. Alıcı rolüm ve alışveriş yeteneklerim devam etsin.
- **Yetki kaynağı:** Ürün yazma isteği hem doğrulanmış access token'da `seller` rolü hem de aynı `sub` için `approved` başvuru gerektirir. Tek başına token rolü veya başvuru durumu yetki sağlamaz. Admin ürün işlemleri seller başvurusundan bağımsızdır.
- **Onay akışı:** Admin başvuruyu `under_review → approval_pending` geçirir; Keycloak rol atama ve doğrulama başarılı olduğunda `approved` olur. Provisioning başarısızsa başvuru `approval_pending` kalır, işlem başarı gibi raporlanmaz ve seller token'ı verilmedikçe ürün yazma reddedilir. Rol atama denemesi güvenle tekrar edilebilir; audit geçişleri korunur.
- **Satıcı sınırı:** Onaylı seller yeni ürünü kendi doğrulanmış token `sub` değeriyle sahiplenir; istemci owner kimliği belirleyemez. Seller yalnızca kendi ürünlerini düzenleyebilir/silebilir; başka satıcı ürününde `404` döner. Admin tüm ürünleri yönetebilir. Ürün kataloğu buyer'lara ortak görünür.
- **Alıcı rolünün devamı:** Onaylı seller'ın `buyer` rolü korunur; alıcı kataloğu ve mevcut alışveriş işlevleri etkilenmez. Bu gereksinim satıcı sipariş/fulfillment paneli veya sipariş erişimi eklemez; bunlar REQ-017 kapsamındadır.
- **Manuel onayın anlamı:** Başvuru, beyan bilgilerine dayalı uygulama içi manuel karardır. Onay formal KYC/KYB, ticari/yasal uygunluk veya canlı satış izni iddiası değildir. Gerçek PSP/para hareketi, kargo/taşıyıcı ve KYC/KYB entegrasyonları kapsam dışıdır; yalnızca yerel/mock akışlar kullanılır.

### Kabul kriterleri

1. `buyer` veya `seller` rolü tek başına seller ürün yazma yetkisi vermez. POST/PUT/DELETE ürün istekleri yalnız admin'e veya hem `seller` rolü hem aynı `sub` için `approved` başvurusu bulunan kullanıcıya izin verir.
2. `draft`, `submitted`, `under_review`, `changes_requested`, `approval_pending`, `rejected` ve `withdrawn` durumlarında seller rolü bulunsa bile ürün oluşturma reddedilir; onay dışı durum sonradan oluştuğunda mevcut seller ürünü düzenleme/silme de reddedilir.
3. `approved` başvurusu olup token'ında `seller` rolü bulunmayan kullanıcı ürün oluşturamaz. Başvuru `approved` olmadan seller yetkisi token'a eklenmez.
4. Onaylı seller ürün oluştururken sahiplik doğrulanmış token `sub` değerinden atanır; payload ile başka sahip atanamaz. Seller başka bir satıcının ürününü düzenleyemez/silemez; admin seller sahiplik sınırını aşabilir.
5. Onaylı seller'ın `buyer` yetkileri ve ortak katalog görünümü korunur. Başvuru/ürün izinleri checkout, siparişin seller tarafından görülmesi veya fulfillment yetkisi tanımlamaz.
6. Admin'in onay isteği önce `approval_pending` durumunu kalıcılaştırır. Keycloak rol provisioning hatası `503` döndürür; başvuru pending kalır. Retry başarılı rol atamasını doğrular ve ancak sonra `approved` yapar; başarısız/tekrarlı işlem satıcıya onaysız erişim veya yinelenen audit geçişi sağlamaz.
7. Gerçek ödeme, taşıyıcı/kargo ve KYC/KYB servisleri çağrılmaz; onay hukuki uygunluk olarak sunulmaz.

### Test katmanı ve izlenebilirlik

- **API/izin matrisi:** `apps/api/tests/test_products.py`; onaysız her başvuru durumu, seller rolü olmadan approved başvuru, approval-pending'e dönen başvuru sonrası POST/PUT/DELETE, approved seller CRUD'u, seller sahipliği ve buyer ortak katalog görünümü.
- **Onay/rol provisioning:** `apps/api/tests/test_seller_applications.py`; başarılı onay/audit, Keycloak provisioning hatası, pending durum ve güvenli retry.
- **Gerçek Keycloak E2E:** `apps/web/e2e/seller-applications.spec.ts`; buyer başvurur, admin onaylar, yeni oturumda buyer+seller rolleri görülür, seller ürün yayımlar ve başka buyer ortak katalogda ürünü salt okunur görür.
- **Geliştirme/test kapısı:** İlgili backend testleri, frontend lint/build ve mevcut gerçek Keycloak E2E kalite kapısı geçmelidir; E2E yalnız yapılandırılmış yerel test realm'inde çalıştırılır.
