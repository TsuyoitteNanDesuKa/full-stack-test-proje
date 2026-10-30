# Ürün Gereksinimleri — Çevrimiçi Alışveriş Sitesi

Bu belge, ürün gereksinimlerinin kapsamını ve kabul kriterlerini tutar. Gereksinimler Agile dilimler halinde geliştirilir; her gereksinim API/UI uygulamasına, testlere ve tamamlanma kararına izlenebilir olmalıdır.

## Ürün özeti

Müşterilerin ürünleri bulup satın alabildiği bir çevrimiçi mağaza geliştirilecektir. Ürün kataloğu, arama, sepet, sipariş ve kullanıcı hesapları ayrı dilimlerle eklenecektir. Kimlik sağlayıcı olarak Keycloak kullanılacak; uygulama kimlik doğrulamayı OIDC üzerinden yapacak, mağazaya özgü profil ve yetkilendirme kararlarını backend'de sürdürecektir.

## Kapsam ve varsayımlar

- İlk istemci uygulaması tarayıcı üzerinden kullanılacaktır; bu gereksinim backend API ve login arayüzünü kapsar.
- REQ-001'in yerel parola tabanlı ilk prototipi Keycloak/OIDC entegrasyonuyla değiştirilmektedir; alıcı self-registration REQ-006 kapsamındadır.
- Alıcı, satıcı ve platform yöneticisi farklı iş profilleridir. Herkese açık kayıt yalnızca alıcı hesabı oluşturur; satıcı/yönetici rolü kullanıcı tarafından seçilemez veya yükseltilemez.
- E-posta doğrulama ve parola sıfırlama daha sonraki dilimlere bırakılmıştır; ilk kayıt akışında e-posta doğrulaması zorunlu değildir.
- Yerel geliştirme veritabanı SQLite'tır. PostgreSQL'e geçiş ayrı ortam çalışmasıdır.
- Ana sayfa ve ürün kataloğu yalnızca doğrulanmış müşterilere sunulur. Ürün oluşturma, güncelleme ve silme işlemleri yönetici rolüyle sınırlandırılır.

## Gereksinim öncelikleri

- **P0:** İlk çalışan müşteri dilimi için zorunlu.
- **P1:** İlk ürün sürümünde gerekli, ancak sonraki dilimde tamamlanabilir.
- **P2:** İleri sürüm/iyileştirme.

## Kullanıcı profili araştırması ve ürün kararları

Bu araştırma, sağlayıcıların kamuya açık müşteri/satıcı akışları ile mağaza için aldığımız ürün kararlarını birbirinden ayırır. Büyük pazar yerlerinin iç rol/izin matrisleri kamuya açık olmadığı için aşağıdaki profiller birebir Amazon veya Trendyol iç sistemlerinin rol dökümü değildir.

| Profil | Pazar yeri örüntüsü ve proje kararı |
|---|---|
| Alıcı | Trendyol'un herkese açık giriş/kayıt ekranı e-posta ile devam etme ve Google/Facebook ile devam etme seçeneklerini gösteriyor. Amazon'un tüketici hesapları da ayrı bir alışveriş hesabı deneyimi sunuyor. İlk dilimde kullanıcı e-posta ve parola ile kendi alıcı hesabını oluşturur; adres/ödeme bilgisi kayıt sırasında istenmez. |
| Satıcı | Amazon'ın resmi satıcı kayıt rehberi, satıcı kaydını alıcı hesabından ayrı bir iş akışı olarak tanımlıyor; işletme, birincil irtibat, banka/ödeme bilgileri ve kimlik doğrulaması istiyor. Trendyol Partner/Satıcı portalı ayrı bir iş yüzeyi; erişilebilen herkese açık sayfalar iç rol ve doğrulama ayrıntılarını göstermiyor. Projede satıcı, bireysel giriş hesabından ziyade ileride bir satıcı/işletme profiline bağlanacak ayrıcalıklı aktör olacaktır. Satıcı başvurusu, işletme doğrulaması ve ekip üyeleri bu gereksinimin dışındadır. |
| Platform yöneticisi | Pazar yerlerinde platform operasyonu ve moderasyonu alıcı/satıcı deneyimlerinden ayrıdır. Bu projede admin rolü yalnızca güvenilir yönetim kanalından atanır; herkese açık kayıtla admin olunamaz. Admin, mağaza genelindeki yönetim işlemlerini yapar; satıcıya ait ürün/işletme yetkileri ileride ayrı kurallarla tanımlanır. |

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
6. Yönetici olmayan kullanıcı ürün oluşturamaz; `POST /api/v1/products` isteği `403 Forbidden` döndürür. Ürün eklemek için geçerli yönetici belirteci gerekir.
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

Yalnızca admin rolüne açık. İstek gövdesi `name`, `category`, `description`, `price` ve `stock` alanlarından oluşur; başarılı yanıt oluşturulan ürünü `201 Created` ile döndürür. Geçersiz veri `422`, admin olmayan kullanıcı `403`, token yok/geçersiz ise `401` alır.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-002-T1 | API | Boş ürün kataloğu, geçerli müşteri belirteci | `200`, boş liste ve toplam 0 |
| REQ-002-T2 | API | Geçerli admin gövdesiyle ürün oluşturma | `201`, saklanan ürün alanları döner |
| REQ-002-T3 | API | Müşteri ürün oluşturmaya çalışır | `403`, ürün oluşturulmaz |
| REQ-002-T4 | API | Ürün adı/kategori/açıklama/fiyat/stok sınırları geçersiz | `422`, ürün oluşturulmaz |
| REQ-002-T5 | API | Ürünleri limit ve offset ile listeleme | Toplam sayısı ve kimliğe göre kararlı sayfa döner |
| REQ-002-T6 | API | Token yok veya pagination parametresi geçersiz | Sırasıyla `401` veya `422` |
| REQ-002-T7 | Component/integration | Ürün listesi yüklendi | Ad, kategori, açıklama, TRY fiyatı ve stok erişilebilir tabloda görünür |
| REQ-002-T8 | Component | Boş katalog veya ürün API hatası | Boş durum veya yeniden denenebilir hata gösterilir |
| REQ-002-T9 | E2E | Admin API ile örnek ürün ekle, müşteri olarak giriş yap | Ürün korumalı katalog endpoint'inden okunup tabloda gösterilir |
| REQ-002-T10 | E2E | Hatalı giriş | Ana sayfa ve ürün endpoint'lerine istek gönderilmez |
| REQ-002-T11 | Unit | `ProductCreateRequest` şema sınırları | Geçerli üst sınırlar kabul; uzunluk/fiyat/stok dışı değerler reddedilir |
| REQ-002-T12 | Frontend unit | Ürün istemcisi API hatası | HTTP hata durumu ve mesajı çağırana aktarılır |
| REQ-002-T13 | Component | Ürün listesi beklemede | Erişilebilir yükleniyor durumu tablo gelene kadar görünür |

**Test katmanı izlenebilirliği:** Şema alanlarının sınır/birim doğrulaması `apps/api/tests/test_product_schemas.py` (unit); kimlik doğrulama, admin yetkisi, SQLite kalıcılığı, API yanıtları ve sayfalama `apps/api/tests/test_products.py` (API/entegrasyon); query/header ve API hata aktarımı `apps/web/src/api.test.ts` (istemci unit); tablo, yükleniyor/boş/hata/yeniden deneme davranışları `apps/web/src/App.test.tsx` (component/frontend entegrasyonu); admin ile API'den ürün ekleyip müşteri UI'ında listeleme ve yetki reddi `apps/web/e2e/login.spec.ts` (gerçek tarayıcı E2E). Lint, TypeScript build ve coverage eşikleri CI statik/kalite kapılarıdır.

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
6. Geçerli form admin erişim belirteciyle `POST /api/v1/products` endpoint'ini çağırır. Backend doğrulamayı ve admin yetkisini yeniden kontrol eder.
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

**Test katmanı izlenebilirliği:** Alan şema/normalizasyon sınırları `apps/api/tests/test_product_schemas.py` (unit); migration backfill ve rollback `apps/api/tests/test_product_migration.py`; API `422`/`409` ve DB kalıcılığı `apps/api/tests/test_products.py` (API/entegrasyon); gövde/başlık/hata aktarımı `apps/web/src/api.test.ts` (istemci unit); form sınırları, olumsuz girdiler, başarı, iptal ve API hata mesajları `apps/web/src/ProductCreatePage.test.tsx`; rol bazlı görünürlük ve başarılı kayıt `apps/web/src/App.test.tsx`; tarayıcı alan reddi ve yinelenen ad `apps/web/e2e/login.spec.ts`. Lint, TypeScript ve coverage eşikleri CI kalite kapılarıdır.

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

Yalnızca admin rolüne açık, tüm ürün alanlarını bekleyen güncelleme endpoint'i. İstek gövdesi REQ-003'te tanımlanan `name`, `category`, `description`, `price` ve `stock` alanlarını taşır. Yanıt `ProductResponse` içerir ve `updated_at` ISO-8601 zamanı döndürür. Ürün listesi ve ürün oluşturma yanıtlarında `updated_at` alanı bulunur; yeni ürün için `null` değerindedir.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-004-T1 | API | Admin tüm alanları günceller | `200`, tüm değerler ve `updated_at` döner |
| REQ-004-T2 | API/entegrasyon | Müşteri güncellenmiş ürünü listeler | Ürün alanları ve `updated_at` güncel yanıtlanır |
| REQ-004-T3 | API | Token yok, müşteri rolü veya ürün ID'si yok | Sırasıyla `401`, `403`, `404`; veri değişmez |
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

**Test katmanı izlenebilirliği:** Güncelleme, rol, 26 sınıflı geçersiz alan matrisi, unique çakışma ve katalog okuma `apps/api/tests/test_products.py`; migration `apps/api/tests/test_product_migration.py`; `PUT` istemcisi `apps/web/src/api.test.ts`; düzenleme formunun 24 sınıflı geçersiz alan matrisi ve ürün satırı değişimi `apps/web/src/App.test.tsx` ile `apps/web/src/ProductCreatePage.test.tsx`; admin/müşteri tarayıcı akışları ve geçersiz düzenlemenin `PUT` göndermemesi `apps/web/e2e/login.spec.ts` ile doğrulanır.

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

Yalnızca admin rolüne açık. Başarıda boş gövdeli `204 No Content`; bulunamayan ürün için `404`, admin olmayan kullanıcı için `403`, eksik/geçersiz kimlik doğrulama için `401` döndürülür.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-005-T1 | API/entegrasyon | Admin var olan ürünü siler | `204`, boş yanıt; ürün admin ve müşteri listelerinden kalkar, toplam azalır |
| REQ-005-T2 | API negatif | Token yok, müşteri rolü, ürün ID'si yok | Sırasıyla `401`, `403`, `404`; ürün kaydı korunur |
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

**Test katmanı izlenebilirliği:** Silme endpoint'i, rol/404/geçersiz belirteç kontrolleri ve silme sonrası katalog/benzersizlik doğrulamaları `apps/api/tests/test_products.py`; boş yanıt ve hata aktarımı `apps/web/src/api.test.ts`; onay/iptal, hedef satırın kaldırılması, `401`/`404` ve ağ hatasında korunması, bekleyen istekte tekrarın engellenmesi `apps/web/src/App.test.tsx`; admin ve müşteri tarayıcı akışları `apps/web/e2e/login.spec.ts` ile doğrulanır.

## REQ-006 — Keycloak ile alıcı kaydı ve rol tabanlı kullanıcı yönetimi

- **Öncelik:** P0 (v1.0 sonrası ilk özellik dilimi)
- **Durum:** Alıcı registration/login dikey dilimi geliştiriliyor; kapsamlı kabul testi tamamlanmadan tamamlandı sayılmaz.
- **Kullanıcı hikâyesi:** Bir ziyaretçi olarak e-posta ve parolamla alıcı hesabı oluşturmak, giriş yapmak ve alışverişe başlamak istiyorum. Mağaza yöneticisi olarak da alıcı, satıcı ve admin yetkilerinin güvenli biçimde ayrılmasını istiyorum.
- **Ön koşul:** Keycloak yerel geliştirme ortamında çalışır; web istemcisi ve API için OIDC istemci yapılandırması vardır.

### Profil ve yetki modeli

| Rol/profil | İlk dilimde atama | Yetki sınırı |
|---|---|---|
| `buyer` (alıcı) | Herkese açık başarılı kayıtta otomatik atanır | Ana sayfa ve ürün kataloğunu görüntüler; yalnızca kendi kullanıcı verilerine erişir. |
| `seller` (satıcı) | Yalnızca güvenilir admin/operasyon süreciyle; self-registration ile atanamaz | Bu dilimde satıcı başvurusu, işletme doğrulaması ve satıcıya özel ürün yönetimi yoktur. |
| `admin` (platform yöneticisi) | Yalnızca güvenilir Keycloak yönetim kanalıyla; self-registration ile atanamaz | Mevcut ürün CRUD yetkileri admin rolünde kalır. Rol kullanıcı profilinden veya istemci isteğinden değiştirilemez. |

Roller kullanıcı kategorilerini anlatır; satıcı organizasyonu ve birden fazla çalışan/alt rol desteği bu dilimin kapsamı değildir. Backend her istekte doğrulanmış token'daki yetkiyi denetler; yalnızca frontend'de eylem gizlemek yetkilendirme sayılmaz.

### Kabul kriterleri

1. Ziyaretçi e-posta ve parola ile Keycloak'ın kayıt akışından alıcı hesabı oluşturabilir; başarılı kayıt `buyer` rolü verir ve uygulamada oturum açma/ana sayfaya ilerleme imkânı sağlar.
2. Kayıt formu e-posta ve parolayı uygulama backend'ine göndermez; kimlik bilgileri yalnızca Keycloak tarafından işlenir. OIDC tarayıcı akışında Authorization Code + PKCE kullanılır.
3. E-posta benzersizliği Keycloak tarafından korunur. Var olan e-posta ile tekrar kayıt ve geçersiz/eksik alanlar kullanıcıya güvenli, anlaşılır hata verir; hesap/kimlik bilgisi ayrıntıları gereksiz yere açığa çıkarılmaz.
4. İlk sürümde e-posta doğrulaması zorunlu değildir. Kayıt sonrasında doğrulanmamış e-posta ile giriş engellenmez.
5. Parola sıfırlama, e-posta doğrulama, sosyal giriş, MFA ve satıcı self-service başvurusu ilk dilimde sunulmaz; bunlar roadmap'te sonraki işlerdir.
6. Kullanıcı kayıt isteğinde `seller` veya `admin` talep etse bile rol yükseltemez. Yeni alıcı hesabı sadece `buyer` olur; ayrıcalıklı roller yalnızca güvenilir yönetim kanalından atanabilir.
7. FastAPI yalnızca yapılandırılmış Keycloak issuer'ından gelen, imzası ve `iss`, `aud`, süre/aktiflik kontrolleri doğrulanmış access token'ları kabul eder. Eksik, bozuk, süresi dolmuş veya yanlış issuer/audience token `401` döndürür.
8. Backend rol/yetki denetimi uygular: alıcı ürün CRUD yapamaz (`403`); admin mevcut ürün CRUD işlemlerini sürdürebilir; kullanıcı kendi sepeti/siparişi gibi kişisel kayıtlar eklendiğinde yalnızca kendisininkine erişebilir.
9. Keycloak'ın kapalı veya erişilemez olması başarılı kayıt/giriş gibi gösterilmez; kullanıcıya güvenli hata gösterilir ve uygulama hatayı gözlemlenebilir biçimde kaydeder.
10. Mevcut ürün kataloğu ve admin ürün yönetimi akışları Keycloak entegrasyonundan sonra da çalışır; önceki rol/yetkisiz erişim davranışları regresyon testleriyle korunur.

### Dışarıda bırakılanlar

- E-posta adresi doğrulama, parola sıfırlama/değiştirme, MFA, sosyal giriş ve gelişmiş oturum/cihaz yönetimi.
- Satıcı başvurusu, şirket/kimlik/KYC kontrolü, banka/ödeme bilgileri, mağaza profili, satıcı çalışanları ve satıcıya özel ürün yetkileri.
- Admin kullanıcı arayüzü veya kullanıcıların kendi rollerini yönetmesi.
- Müşteri adresi ve ödeme aracı toplama.

### Doğrulama/test fikirleri

| Kimlik | Seviye | Durum | Beklenti |
|---|---|---|---|
| REQ-006-T1 | Keycloak entegrasyon/E2E | Geçerli alıcı kaydı | Keycloak kaydı başarıyla tamamlanır; yeni hesap `buyer` olur ve uygulamaya döner |
| REQ-006-T2 | Keycloak entegrasyon/E2E negatif | Aynı e-posta ile ikinci kayıt | Tekil hesap kuralı korunur; güvenli hata döner |
| REQ-006-T3 | Keycloak entegrasyon/E2E negatif | Eksik/bozuk e-posta veya zorunlu alan | Kayıt reddedilir; hesap/oturum yanlışlıkla oluşturulmaz |
| REQ-006-T4 | Güvenlik/entegrasyon | Self-registration sırasında `seller`/`admin` rolü talep etme | Varsayılan rol `buyer` kalır; istemci rol yükseltemez |
| REQ-006-T5 | API negatif | Yok, bozuk, süresi dolmuş veya yanlış `iss`/`aud` access token | `401`; korumalı veri/işlem açığa çıkmaz |
| REQ-006-T6 | API yetki | Alıcı ürün create/update/delete ister | `403`; ürün verisi değişmez |
| REQ-006-T7 | API yetki | Güvenilir admin token'ı ile ürün CRUD | Mevcut admin davranışı korunur |
| REQ-006-T8 | Component/unit | OIDC kayıt/login yönlendirmesi, callback iptali/bozulması ve Keycloak erişim hatası | Yönlendirme doğru başlar; callback parametreleri temizlenir; hata başarı gibi gösterilmez |
| REQ-006-T9 | E2E | Yeni e-posta ile tarayıcıdan kayıt ve giriş | Keycloak yönlendirmesi, alıcı oturumu ve katalog görünümü çalışır |
| REQ-006-T10 | E2E negatif | Alıcıyla admin işlemi denemesi | Yönetim eylemi görünmez ve API isteği `403` ile reddedilir |

**Test katmanı izlenebilirliği:** Barındırılan Keycloak kayıt formunun başarılı/negatif davranışları izole test realm'iyle entegrasyon ve E2E seviyelerinde; token doğrulama/rol kuralları unit ve API seviyelerinde; OIDC yönlendirme/callback davranışları component seviyesinde doğrulanmalıdır. Yerel uygulama parola formu sunmadığından kayıt formu component testleriyle taklit edilmemelidir. Testlerde gerçek kullanıcı parolası veya üretim hesabı kullanılmamalıdır.

**Sıralı kullanıcı yönetimi dilimleri:** Önce alıcı kayıt/login entegrasyonu tamamlanıp tüm katmanlarda kapsamlı test edilecek. Test kapısı geçmeden satıcı başvurusu geliştirilmeyecek. Ardından satıcı başvurusu ve işletme doğrulaması, bu dilimin kabul/test kapısından sonra admin rol atama akışı geliştirilecek. Bu sonraki iki akışın iş kuralları ayrı gereksinimlerde netleştirilecektir.

## İleri gereksinim adayları

Bu maddeler kapsamı erkenden sabitlememek için henüz kabul kriterlerine dönüştürülmemiştir:

- Satıcı başvurusu, işletme doğrulaması ve satıcı çalışan/alt rol yönetimi.
- Ürün kataloğunda arama ve filtreleme.
- Sepet yönetimi ve stok/ürün fiyatı kuralları.
- Adres ve teslimat seçenekleriyle sipariş oluşturma.
- Ödeme sağlayıcısı entegrasyonu, sipariş geçmişi ve iptal/iade.
