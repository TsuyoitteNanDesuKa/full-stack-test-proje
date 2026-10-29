# Ürün Gereksinimleri — Çevrimiçi Alışveriş Sitesi

Bu belge, ürün gereksinimlerinin kapsamını ve kabul kriterlerini tutar. Gereksinimler Agile dilimler halinde geliştirilir; her gereksinim API/UI uygulamasına, testlere ve tamamlanma kararına izlenebilir olmalıdır.

## Ürün özeti

Müşterilerin ürünleri bulup satın alabildiği bir çevrimiçi mağaza geliştirilecektir. Ürün kataloğu, arama, sepet, sipariş ve müşteri hesabı ayrı dilimlerle eklenecektir. İlk dikey dilim, kayıtlı bir müşterinin kimliğini doğrulayıp ana sayfaya erişmesidir.

## Kapsam ve varsayımlar

- İlk istemci uygulaması tarayıcı üzerinden kullanılacaktır; bu gereksinim backend API ve login arayüzünü kapsar.
- İlk gereksinimde giriş yapacak müşterinin hesabı önceden oluşturulmuş ve etkin durumdadır.
- Herkese açık müşteri kaydı, parola sıfırlama, sosyal giriş ve oturum kapatma ilk gereksinimin kapsamında değildir.
- Yerel geliştirme veritabanı SQLite'tır. PostgreSQL'e geçiş ayrı ortam çalışmasıdır.
- Ana sayfa bu dilimde doğrulanmış erişim gerektiren bir API'dir; ürün kataloğu ve kişiselleştirilmiş içerik sonraki gereksinimlerde ele alınır.

## Gereksinim öncelikleri

- **P0:** İlk çalışan müşteri dilimi için zorunlu.
- **P1:** İlk ürün sürümünde gerekli, ancak sonraki dilimde tamamlanabilir.
- **P2:** İleri sürüm/iyileştirme.

## REQ-001 — Kayıtlı müşteri girişi ve ana sayfaya erişim

**Öncelik:** P0  
**Durum:** Backend ve login arayüzü hazır; kayıt ve ürün kataloğu sonraki dilimlerde geliştirilecek.  
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

### Dışarıda bırakılanlar

- Müşteri kayıt, parola sıfırlama, çok faktörlü kimlik doğrulama ve sosyal giriş.
- Refresh token, cihaz/oturum yönetimi ve oturum kapatma.
- Ürün listesi, arama, kampanya ve kişiye özel ana sayfa içeriği.
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

## İleri gereksinim adayları

Bu maddeler kapsamı erkenden sabitlememek için henüz kabul kriterlerine dönüştürülmemiştir:

- Müşteri hesabı oluşturma ve e-posta doğrulama.
- Ürün kataloğunu görüntüleme, arama ve filtreleme.
- Sepet yönetimi ve stok/ürün fiyatı kuralları.
- Adres ve teslimat seçenekleriyle sipariş oluşturma.
- Ödeme sağlayıcısı entegrasyonu, sipariş geçmişi ve iptal/iade.
