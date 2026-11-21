# Kapsam (Coverage) Politikası

Bu belge, backend ve frontend test kapsamının neyi ölçtüğünü, hangi eşiklerin kalite kapısı olduğunu ve hangi kod yollarının bilinçli olarak test edilmediğini tanımlar. Amaç kapsam yüzdesini tek başına hedeflemek değil, kritik davranışların doğrulandığından emin olmaktır. Kapsam, çalıştırılan kodu ölçer; doğruluğu, E2E davranışını veya iş kurallarının tamlığını kanıtlamaz.

## 1. Ölçüm kapsamı

### Backend (`apps/api`)

- CI kapısı: `uv run pytest --cov=shop_api` çıktısındaki **yalnızca `src/shop_api` kaynak kapsamı**. Eşik `pyproject.toml` içinde `fail_under = 95` olarak tanımlıdır.
- `tests/`, `migrations/` ve `scripts/` kapsam ölçümüne dahil değildir. Tüm proje (`--cov` ile) ölçümü bilgi amaçlıdır ve kapı değildir; test dosyalarının kendisi ölçüme girdiği için düşük bir değer üretir.
- Dal (branch) kapsamı açık olarak etkindir (`branch = true`).
- PostgreSQL'e özgü testler (`-m postgres`) varsayılan koşuda atlanır ve kapsam sayısına dahil edilmez; ayrı bir izole PostgreSQL koşusunda doğrulanır.

### Frontend (`apps/web`)

- Vitest kapsamı `vite.config.ts` içinde `App.tsx`, `api.ts`, `auth.ts`, `ProductCreatePage.tsx` ve `src/*Panel.tsx` dosyalarını kapsar. Giriş noktası, test dosyaları, üretilen kod ve CSS kapsam dışıdır.
- Toplam eşikler: statement %93, branch %88, function %95, line %93.
- Dosya başına eşikler: statement %81, branch %70, function %88, line %83.
- `App.tsx`, `api.ts` ve `ProductCreatePage.tsx` için tüm metriklerde %100 eşiği korunur.

## 2. Son ölçülen değerler (21 Kasım 2026)

| Kapsam | Ölçüm | Kapı | Durum |
|---|---|---|---|
| Backend kaynak (`shop_api`) | %96,90 (statement+branch) | ≥ %95 | Geçti |
| Backend tüm proje (bilgi) | %97 (`tests/` dahil değil ölçüm farkı) | yok | Bilgi |
| Frontend toplam statement | %98,35 | ≥ %93 | Geçti |
| Frontend toplam branch | %93,40 | ≥ %88 | Geçti |
| `App.tsx`, `api.ts`, `ProductCreatePage.tsx` | %100 | %100 | Geçti |

Testler: backend 390 geçti, 22 PostgreSQL testi varsayılan koşuda atlandı; frontend 288/288 geçti.

## 3. Kapsanmayan dalların sınıflandırması

Kapsanmayan her satır aşağıdaki üç sınıftan birine girer. Yeni bir test yazılmadan önce satırın hangi sınıfta olduğu belgelenir.

### A. Ulaşılamaz savunma dalları

Veri modeli kısıtları (ör. yabancı anahtar, `strict`/`min_length` şema doğrulaması) veya mock sağlayıcı tasarımı nedeniyle normal kullanımda çalışamayan dallar. Bu dallar test edilmez; kod sadeleştirilebiliyorsa kaldırılması tercih edilir.

| Dosya | Satırlar | Gerekçe |
|---|---|---|
| `routes/seller_orders.py` | 154, 176, 186 | `order_fulfillments.order_id` yabancı anahtarı ve `PRAGMA foreign_keys=ON` nedeniyle sipariş kaydı olmadan fulfillment oluşmaz |
| `order_fulfillment.py` | 94 | Sepet ürününün `product_id` değeri checkout sırasında her zaman doludur |
| `routes/payments.py` | 453, 469, 480 | Mock sağlayıcı imzayı kendisi üretip doğrular; kayıt, aynı işlem içinde silinmez |
| `routes/payments.py` | 273→275 | `Payment.expires_at` `timezone=True` tanımlı; SQLAlchemy her zaman aware değer döndürür |
| `routes/orders.py` | 213, 602 | Serializasyon ve yabancı anahtar kontrolleri |
| `routes/cart.py` | 184 | `CartItem.product_id` yabancı anahtarı `ondelete` ile boşalır; ürün satırı bulunamadığında dal yalnızca `product_id` boşken girilen 176. satır koluna düşer |
| `schemas.py` | 269, 283 | Pydantic `strict` ve `min_length` doğrulaması önce reddeder |

### B. Eşzamanlılık yarışları

Yalnızca iki eşzamanlı işlem arasında oluşan dallar. Sıralı SQLite testleri bunları güvenilir biçimde tetikleyemez; kapsamı PostgreSQL eşzamanlılık testleri (`-m postgres`) veya gelecekteki bir yük testi sağlar.

| Dosya | Satırlar | Gerekçe |
|---|---|---|
| `routes/payments.py` | 148, 163–172 | İki eşzamanlı idempotency-key isteği arasındaki yarış |
| `routes/payments.py` | 276–277 | Süre kontrolü ile ödeme güncellemesi arasındaki yarış |
| `routes/orders.py` | 296–297, 484, 490, 740–761 | Checkout/iptal döngüsü ile ödeme oluşturma arasındaki yarışlar; `IntegrityError` yeniden deneme yolu |
| `routes/cart.py` | 60 | Eşzamanlı ilk sepet oluşturma (`IntegrityError`) |
| `payment_expiry.py` | 74 | Süresi dolan ödeme taranırken webhook ile yarış |

Not: `cart.py` 60 için PostgreSQL eşzamanlılık testi mevcuttur (`test_cart_postgres.py`); ayrı bir kapsam ölçümüyle doğrulanır.

### C. Gerçek davranış (kapsanması gereken)

Gerçek kullanıcı veya operatör senaryosuyla tetiklenebilen dallar. Bu sınıftaki satırlar test yazılarak kapatılır ve kapsam hedefine dahil edilir.

Bu oturumda kapatılan örnekler: webhook başarısız sonucunda stok üst sınırı (`payments` 317–319), süresi dolmuş ödemede sipariş korunması (`payment_expiry` 77→96), iade tutar tavanı, webhook'ta event ID çakışması, sepet ürünü silinmiş iken güncelleme (`cart` 176 ürün `None` dalı), iade sebebinin kırpılması ve Türkiye telefon biçimi normalizasyonu (`schemas`).

Kalan gerçek davranış satırları (`main.py` 56–57, 97, 146–151) lifespan ve istisna işleyicisi altyapısıdır; bunları kapatmak için uygulama yaşam döngüsü testleri gerekir ve sonraki tura bırakılmıştır.

## 4. Kapsam kurallarına uyma

- Yeni kod yolu eklenirken aynı dilimde ilgili davranış testi yazılır (bkz. `ROADMAP.md` Definition of Done).
- Kapsam yüzdesi düşerse önce nedenini sınıflandırmadan eşik düşürülmez.
- Eşikler yalnızca gerçek bir davranış değişikliği veya yeni sınıflandırma kararıyla değiştirilir; bu belge güncellenerek.
- Ulaşılamaz (A) dallar için `# pragma: no cover` kullanımı yalnızca bu belgede listelenen satırlar için kabul edilir ve her biri gerekçesiyle belgelenir.
- Yarış (B) dalları için kapsam ölçümü sıralı testlerle hedeflenmez; PostgreSQL eşzamanlılık testleri ya da yük testleri kullanılır.
- Kapsam, E2E veya güvenlik testlerinin yerine geçmez.

## 5. Bilinen sınırlar

- Backend kapsamı SQLite üzerinde ölçülür; PostgreSQL'e özgü dallar ayrı koşuda doğrulanır ve bu belgedeki yüzdelere dahil değildir.
- Frontend kapsamı JSDOM tabanlıdır; görsel düzen ve gerçek tarayıcı davranışı ölçülmez (bkz. Playwright E2E ve axe taramaları).
- Dal kapsamı, koşulların tüm kombinasyonlarını doğrulamaz; yalnızca her dalın bir kez çalıştığını gösterir.
