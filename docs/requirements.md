# Ürün Gereksinimleri — Çevrimiçi Alışveriş Sitesi

Bu belge, ürün gereksinimlerinin kapsamını ve kabul kriterlerini tutar. Gereksinimler Agile dilimler halinde geliştirilir; her gereksinim API/UI uygulamasına, testlere ve tamamlanma kararına izlenebilir olmalıdır.

## Ürün özeti

Müşterilerin ürünleri bulup satın alabildiği bir çevrimiçi mağaza geliştirilecektir. Ürün kataloğu, arama, sepet, sipariş ve müşteri hesabı ayrı dilimlerle eklenecektir. İlk dikey dilim, kayıtlı bir müşterinin kimliğini doğrulayıp ana sayfaya erişmesidir.

## Kapsam ve varsayımlar

- İlk istemci uygulaması tarayıcı üzerinden kullanılacaktır; bu gereksinim backend API ve login arayüzünü kapsar.
- İlk gereksinimde giriş yapacak müşterinin hesabı önceden oluşturulmuş ve etkin durumdadır.
- Herkese açık müşteri kaydı, parola sıfırlama, sosyal giriş ve oturum kapatma ilk gereksinimin kapsamında değildir.
- Yerel geliştirme veritabanı SQLite'tır. PostgreSQL'e geçiş ayrı ortam çalışmasıdır.
- Ana sayfa ve ürün kataloğu yalnızca doğrulanmış müşterilere sunulur. Ürün oluşturma işlemi yönetici rolüyle sınırlandırılır.

## Gereksinim öncelikleri

- **P0:** İlk çalışan müşteri dilimi için zorunlu.
- **P1:** İlk ürün sürümünde gerekli, ancak sonraki dilimde tamamlanabilir.
- **P2:** İleri sürüm/iyileştirme.

## REQ-001 — Kayıtlı müşteri girişi ve ana sayfaya erişim

**Öncelik:** P0  
**Durum:** Tamamlandı; ürün kataloğu REQ-002 kapsamındadır.
**Kullanıcı hikâyesi:** Bir müşteri olarak hesabıma güvenli biçimde giriş yapıp mağaza ana sayfasını görmek istiyorum; böylece alışverişe başlayabilirim.  
**Ön koşul:** Müşteri hesabı etkin durumdadır ve geçerli bir e-posta adresiyle önceden oluşturulmuştur.

### Kabul kriterleri

1. E-posta ve doğru parola ile giriş isteği kabul edilir ve sınırlı ömürlü erişim belirteci döndürülür.
2. E-posta adresi büyük/küçük harf farkı olmadan eşleştirilir; baştaki/sondaki boşluklar yok sayılır.
3. Yanlış parola, bilinmeyen e-posta veya devre dışı hesap aynı genel kimlik doğrulama hatasını döndürür; hesap varlığı açığa çıkarılmaz.
4. Giriş isteğinde e-posta veya parola eksik/geçersizse istek doğrulama hatasıyla reddedilir; parola yanıt veya loglarda gösterilmez.
5. Geçerli erişim belirteciyle ana sayfa isteği başarıyla karşılanır ve karşılama içeriği döner.
6. Belirteç olmadan, bozuk belirteçle veya süresi geçmiş belirteçle ana sayfa isteği `401 Unauthorized` döndürür.
7. Erişim belirteci yalnızca kimlik bilgisi doğrulanmış etkin hesaba verilir.
8. Giriş başarılı olduğunda istemci ana sayfaya yönelir; ürün kataloğu REQ-002'ye göre listelenir.

### Dışarıda bırakılanlar

- Müşteri kayıt, parola sıfırlama, çok faktörlü kimlik doğrulama ve sosyal giriş.
- Refresh token, cihaz/oturum yönetimi ve oturum kapatma.
- Ürün arama, filtreleme, kampanya ve kişiye özel ana sayfa içeriği.
- Kayıt, ürün listesi ve müşteri hesabı ekranları.

### API sözleşmesi (ilk sürüm)

#### `POST /api/v1/auth/login`

İstek:

```json
{
  "email": "customer@example.com",
  "password": "customer-password"
}
```

Başarılı yanıt `200 OK`:

```json
{
  "access_token": "<signed-access-token>",
  "token_type": "bearer",
  "expires_in": 1800
}
```

Geçersiz kimlik bilgisi `401 Unauthorized`:

```json
{
  "detail": "Geçersiz e-posta veya parola."
}
```

Girdi doğrulama hataları `422 Unprocessable Entity` döndürür.

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
| REQ-001-T1 | API | Geçerli e-posta/parola | `200`, bearer belirteci |
| REQ-001-T2 | API | E-posta farklı harf kullanımı/boşlukla | Geçerli hesapla giriş başarılı |
| REQ-001-T3 | API | Yanlış parola veya bilinmeyen e-posta | Aynı genel `401` yanıtı |
| REQ-001-T4 | API | Eksik/geçersiz e-posta | `422`, belirteç verilmez |
| REQ-001-T5 | API | Belirteçli ana sayfa isteği | `200`, beklenen karşılama içeriği |
| REQ-001-T6 | API | Belirteç yok/bozuk/süresi dolmuş | `401` |
| REQ-001-T7 | Güvenlik | Yanıt gövdesi ve uygulama logları | Parola veya parola özeti dışarı sızmaz |
| REQ-001-T8 | Component/integration | Başarılı giriş ve ana sayfa isteği | Login formu token'ı korumalı istekte kullanır; ana sayfa görünür |
| REQ-001-T9 | Component | Login `401`, `422`, `5xx` ve bağlantı hataları | Her durumda kullanıcıya uygun, sunucu iç detaylarını açmayan mesaj gösterilir |
| REQ-001-T10 | E2E | Gerçek tarayıcı, API ve veritabanıyla geçerli giriş | Login ve korumalı ana sayfa akışı tamamlanır; çıkış login formuna döner |
| REQ-001-T11 | E2E | Gerçek backend ile yanlış parola | Genel hata gösterilir; ana sayfa isteği gönderilmez |
| REQ-001-T12 | E2E | Yanlış parola | Ürün listesi isteği gönderilmez |

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
7. Ürün oluşturma alanları doğrulanır: ad (2–120), kategori (2–80), açıklama (1–600), fiyat (0'dan büyük ve en fazla iki ondalık basamaklı), stok (sıfır veya daha büyük tam sayı). Başarı `201 Created` döndürür.
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

### Kabul kriterleri

1. Admin, mevcut giriş endpoint'ine geçerli kimlik bilgileriyle giriş yapar; yanıt kendi rolünü `is_admin: true` olarak bildirir.
2. Normal müşteri girişi `is_admin: false` döndürür; kullanıcı/rol bilgisi yalnızca giriş yapan hesaba aittir.
3. Admin girişinde ürün listesi sayfasında **Ürün ekle** butonu görünür; müşteri girişinde bu buton ve ürün ekleme ekranına erişim görünmez.
4. Admin butona bastığında ürün adı, kategori, açıklama, TL fiyatı ve stok alanlarını içeren ayrı ürün ekleme sayfası açılır.
5. Form zorunlu alanları ve backend ile uyumlu uzunluk, pozitif fiyat (en fazla iki ondalık), sıfır veya daha fazla tam sayı stok sınırlarını istemci tarafında doğrular; geçersiz form API isteği göndermez.
6. Geçerli form admin erişim belirteciyle `POST /api/v1/products` endpoint'ini çağırır. Backend doğrulamayı ve admin yetkisini yeniden kontrol eder.
7. `201 Created` yanıtında eklenen ürün katalog tablosuna eklenir ve admin ürün listesi ekranına döner.
8. Form iptal edilirse kayıt isteği gönderilmez ve mevcut katalog ekranına dönülür.
9. Yetki, oturum, doğrulama, sunucu veya ağ hataları kullanıcıya uygun, sunucu iç detaylarını açığa çıkarmayan mesajlarla gösterilir; istek sürerken yinelenen kayıt engellenir.

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

REQ-002'de tanımlanan endpoint kullanılır. İstek `Authorization: Bearer <admin-access-token>` başlığı gerektirir; müşteri için `403`, belirteç yok/geçersiz ise `401`, geçersiz alanlarda `422`, başarılı kayıtta `201 Created` döner.

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

**Test katmanı izlenebilirliği:** Rolün login yanıtında verilmesi `apps/api/tests/test_auth.py` (API); ürün yazma endpoint'inin admin kontrolü ve doğrulaması `apps/api/tests/test_products.py` (API/entegrasyon); istek gövdesi/başlığı `apps/web/src/api.test.ts` (istemci unit); form doğrulaması, başarı, iptal ve hata durumları `apps/web/src/ProductCreatePage.test.tsx`; admin/müşteri rolüne göre ekran ve kayıt akışı `apps/web/src/App.test.tsx` (component/entegrasyon); gerçek admin hesabıyla tarayıcı girişi ve ürün ekleme `apps/web/e2e/login.spec.ts` (E2E). Lint, TypeScript ve coverage eşikleri CI kalite kapılarıdır.

## İleri gereksinim adayları

Bu maddeler kapsamı erkenden sabitlememek için henüz kabul kriterlerine dönüştürülmemiştir:

- Müşteri hesabı oluşturma ve e-posta doğrulama.
- Ürün kataloğunda arama ve filtreleme.
- Sepet yönetimi ve stok/ürün fiyatı kuralları.
- Adres ve teslimat seçenekleriyle sipariş oluşturma.
- Ödeme sağlayıcısı entegrasyonu, sipariş geçmişi ve iptal/iade.
