# v1.1.0 — Kimlik yaşam döngüsü, alıcı etkileşimi ve kalite kapanışı

Bu sürüm, v1.0.0 üzerine e-posta doğrulama/parola sıfırlama, alıcı favorileri, ürün değerlendirmeleri ve iptal edilen siparişten sepete ekleme özelliklerini ekler; ayrıca test olgunluğu ve dokümantasyon kapanışını tamamlar. Ödeme, iade ve kargo hâlâ yerel/mock davranışlardır; gerçek para hareketi yoktur.

**Kapsam donduruldu (28 Kasım 2026):** Bu sürüm proje kapanışıdır. Yeni ürün dilimi eklenmez; açık işler aşağıda açıkça listelenir.

## Yeni özellikler

- **REQ-019 — E-posta doğrulama ve parola sıfırlama:** Doğrulanmamış hesap giriş yapamaz; Keycloak `reset-credentials` akışıyla parola sıfırlama. Yerel Mailpit ile e-posta yakalama. Realm parola politikası: en az 8 karakter, büyük/küçük harf, rakam, kullanıcı adı/e-posta olamaz. Tarayıcı E2E canlı Keycloak + Mailpit ile doğrulandı (6 senaryo).
- **REQ-021 — Alıcı favorileri:** Buyer'a özel, idempotent ekleme/çıkarma ve sayfalı liste; ürün silinince cascade temizlik; eşzamanlı ekleme tek kayıt üretir.
- **REQ-022 — Ürün değerlendirmeleri:** Alıcı ürün değerlendirmesi; schema ve API testleri.
- **REQ-023 — İptal edilen siparişten sepete ekleme:** İptal edilen siparişin kalemlerini sepete geri yükleme.

## Kalite ve CI iyileştirmeleri

- GitHub Actions action'ları Node.js 24 uyumlu sürümlere yükseltildi (checkout v7, setup-node v7, setup-uv v10, upload/download-artifact v7/v8); Node 20 deprecation uyarısı kalktı.
- Keycloak E2E kayıt akışı `verifyEmail` açıkken düzeltildi; Mailpit doğrulaması ve sonraki parola ekranına uyarlandı; admin CRUD temizliği düzeltildi. Gece #59'da 17/17 geçti.
- CI Keycloak admin parolası statik değerden kriptografik rastgele üretime ve Actions maskelemesine taşındı (log doğrulaması açık iş).
- Erişilebilirlik QA-023 testi iki bağımsız teste bölündü (zaman aşımı giderildi; 5 ardışık yeşil koşu).
- DAST pilotu (OWASP ZAP Baseline + OpenAPI GET-only) izole ortamda eklendi; bulgu triyajı ve istisna politikası `docs/dast-findings.md` içinde.
- Sipariş listesi sayfalandı (`/api/v1/orders/page`); eski `GET /api/v1/orders` deprecated olarak korunuyor.

## Kalite kapıları (28 Kasım 2026, yerel ölçüm)

| Kapı | Sonuç |
|---|---|
| Backend pytest (SQLite, `fail_under = 95`) | 438 geçti, 26 atlandı (PostgreSQL ayrı koşu); kaynak kapsamı %97,04 |
| Backend Ruff lint/format | Temiz |
| OpenAPI snapshot ve istemci sözleşmesi | Eşleşiyor |
| Backend bağımlılık taraması (pip-audit) | Bilinen zafiyet yok |
| Frontend Vitest | 365/365 geçti (29 dosya) |
| Frontend kapsam | statement %96,46, branch %91,92, function %98,50, line %97,71 |
| Frontend lint, TypeScript build | Temiz |
| Frontend bağımlılık taraması (`npm audit`) | 0 bulgu |
| Playwright deterministik smoke E2E | 14/14 geçti (yerel, 28 Kasım) |
| Gerçek Keycloak E2E (gece) | 17/17 (gece #59, #68) |
| DAST pasif pilotu | Başarılı; doğrulanmış gerçek açık yok |

Kapsam politikası: [docs/coverage-policy.md](./coverage-policy.md). Test planı: [docs/test-plan.md](./test-plan.md).

## Bilinen sınırlamalar

- Ödeme, iade ve kargo yalnızca yerel/mock davranışlardır; gerçek para hareketi yoktur.
- E-posta doğrulama/sıfırlama yerel Mailpit üzerinde çalışır; gerçek e-posta sağlayıcısı kullanılmaz.
- `GET /api/v1/orders` (tam liste) eski davranışla korunur ve performans hedefini karşılamaz (100/1.000 siparişte p95 hedef dışı). Sayfalı `/orders/page` hedefte (p95 ≈ 30 ms).
- Performans ölçümleri tek bir yerel makinede, 10 VU ile yapıldı; üretim temsili değildir.
- DAST yalnız pasif tarama; üretim başlıkları/TLS/WAF hakkında kanıt üretmez.

## Açık işler (bilinçli, gizlenmez)

1. Manuel NVDA erişilebilirlik koşusu — plan hazır ([docs/manual-accessibility-plan.md](./manual-accessibility-plan.md)), koşu yapılmadı.
2. Uzak DAST workflow'unun kimlikli aşamasının tek seferlik doğrulanması.
3. CI Keycloak credential maskelemesinin yeni bir koşuda log teyidi.
4. Frontend ilk-yük optimizasyonu (QA-027) kök-neden kanıtı olmadan duraklatıldı.

## Kapsam dışı

Gerçek ödeme/PSP ve para hareketi, kargo/taşıyıcı entegrasyonu, KYC/KYB ve resmi satıcı doğrulaması, sosyal giriş, MFA, mobil uygulama, üretim altyapısı.
