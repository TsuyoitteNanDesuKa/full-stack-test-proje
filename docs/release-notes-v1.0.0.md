# v1.0.0 — Yerel alışveriş uygulaması (öğrenme projesi) sürüm notları

Bu sürüm, gerçek para, kargo veya KYC/KYB entegrasyonu içermeyen yerel bir marketplace öğrenme projesidir. Tüm ödeme, iade ve kargo akışları mock/yerel davranışlardır.

## Kapsam

- Keycloak ile alıcı kaydı ve OIDC girişi; `buyer`, `seller`, `admin` rol modeli.
- Satıcı başvurusu, admin manuel incelemesi ve Keycloak `seller` rolü provisioning'i (REQ-007, REQ-016).
- Ürün CRUD'u: admin tüm ürünleri, onaylı satıcı yalnızca kendi ürünlerini yönetir.
- Katalog arama, filtreleme ve sıralama (REQ-013); tekil ürün detay sayfası (REQ-020).
- Sepet, adres defteri, teslimat seçenekleri (REQ-009, REQ-015).
- Sipariş oluşturma, mock hosted ödeme, imzalı webhook ve expiry (REQ-010, REQ-011).
- Sipariş takibi, alıcı iptali, yerel ürün iadesi ve çok satıcılı fulfillment (REQ-012, REQ-014, REQ-017, REQ-018).
- Operasyon: liveness/readiness, istek korelasyonu, güvenli loglama (QA-028).

## Kalite kapıları (son doğrulama: 21 Kasım 2026, `dc72e5f`)

| Kapı | Sonuç |
|---|---|
| Backend pytest (kaynak kapsam, `fail_under = 95`) | 400 geçti, 22 PostgreSQL testi ayrı koşuda; kapsam %96,91 |
| Backend Ruff lint/format | Temiz |
| OpenAPI snapshot ve istemci sözleşmesi | Eşleşiyor |
| Backend bağımlılık taraması (pip-audit, kilitli liste) | Bilinen zafiyet yok |
| Frontend Vitest | 305/305 geçti; `App.tsx`, `api.ts`, `ProductCreatePage.tsx` %100 kapısı |
| Frontend lint, TypeScript build | Temiz |
| Frontend bağımlılık taraması (`npm audit --audit-level=low`) | 0 bulgu |
| Playwright deterministik E2E (ürün detay) | 3/3 geçti |
| GitHub Actions CI | Kullanıcı tarafından yeşil doğrulandı |

Kapsam politikası ve sınıflandırılmış kapsanmayan dallar: [docs/coverage-policy.md](./coverage-policy.md).

## Bilinen sınırlamalar

- Ödeme, iade ve kargo yalnızca yerel/mock davranışlardır; gerçek para hareketi yoktur.
- E-posta doğrulama ve parola sıfırlama (REQ-019) yerel Mailpit üzerinde uygulanmış ve tarayıcı E2E ile doğrulanmıştır; gerçek e-posta sağlayıcısı kullanılmaz. Parola politikası (en az 8 karakter, büyük/küçük harf, rakam) realm'de tanımlıdır; bu sürüm etiketinden sonra eklenmiştir (`8b7a98e`).
- Satıcı onayı manuel beyana dayanır; KYC/KYB ve resmi uygunluk doğrulaması yoktur.
- Admin rolü yalnızca Keycloak Admin Console'dan atanır.
- Frontend ölçüm sonuçları JSDOM tabanlıdır; tarayıcı davranışı E2E ile ayrıca doğrulanır.
- Manuel erişilebilirlik incelemesi (P2) tamamlanmamıştır; otomatik axe taramaları geçmektedir.
- Performans hedeflerinin tamamı karşılanmamıştır; sayfalı sipariş geçmişi dışındaki bazı uç noktaların yük sonuçları hedefin altındadır (bkz. ROADMAP QA-026).
- QA-027 frontend yükleme optimizasyonu hedeflerine ulaşmamıştır.

## Bilinen açık işler

- Backend kapsamında kalan kapsanmayan dallar `docs/coverage-policy.md` içinde sınıflandırılmıştır (ulaşılamaz savunma, yarış, gerçek davranış).
- `main.py` lifespan worker kapanış dalı için deterministik test (P7).
- GitHub Actions Node.js 20 deprecation uyarıları (`actions/checkout@v4`, `setup-node@v4`, `upload-artifact@v4`) için action sürümlerinin güncellenmesi.
